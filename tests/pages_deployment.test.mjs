import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildPublic,preparePages,ROOT} from '../scripts/build_pages.mjs';
import {cloudflareAPI,ensureProject,attachDomain,runBuild,accountFromWrangler,deploymentError,wranglerFailure,PROJECT,DOMAIN,DATABASE} from '../scripts/cloudflare_build.mjs';

test('Pages advanced-mode artifact keeps API code separate from the public Worker assets',async()=>{
  buildPublic();const stage=await preparePages();
  try {
    const publicFiles=await readdir(join(ROOT,'dist'),{recursive:true});
    const pagesFiles=await readdir(stage.publicDir,{recursive:true});
    assert.deepEqual(pagesFiles.sort(),[...publicFiles,'_worker.js','_routes.json'].sort());
    assert.ok(!publicFiles.includes('_worker.js'));
    const worker=await readFile(join(stage.publicDir,'_worker.js'),'utf8');
    assert.ok(worker.includes('CREATE TABLE IF NOT EXISTS accounts'));assert.ok(worker.includes('/api/diary'));
    assert.deepEqual(JSON.parse(await readFile(join(stage.publicDir,'_routes.json'),'utf8')),{version:1,include:['/api/*'],exclude:[]});
    assert.ok(!pagesFiles.some(file=>file.includes('node_modules')||file==='package.json'||file==='README.md'));
  }finally{await rm(stage.directory,{recursive:true,force:true});}
});
test('Pages setup touches only its dedicated database project and custom domain without changing nameservers',async()=>{
  const calls=[],uuid='11111111-1111-4111-8111-111111111111';
  const api=async(path,method='GET',body)=>{
    calls.push({path,method,body});
    if(path.startsWith('/d1/database?'))return [];
    if(path==='/d1/database')return {name:DATABASE,uuid};
    if(path===`/pages/projects/${PROJECT}`){const error=new Error('Not found');error.status=404;throw error;}
    if(path==='/pages/projects')return {name:PROJECT,subdomain:`${PROJECT}.pages.dev`};
    if(path.endsWith('/domains'))return method==='GET'?[]:{name:DOMAIN};
    throw new Error('Unexpected API call');
  };
  const result=await ensureProject(api);await attachDomain(api);
  assert.equal(result.database.uuid,uuid);
  assert.deepEqual(calls.find(call=>call.path==='/d1/database').body,{name:DATABASE});
  assert.deepEqual(calls.find(call=>call.path.endsWith('/domains')&&call.method==='POST').body,{name:'moje.itfit.cz'});
  assert.ok(calls.every(call=>!call.path.includes('/zones')&&!call.path.includes('/dns_records')));
  assert.ok(calls.every(call=>!JSON.stringify(call).includes('trener')));
});
test('repeated deployments reuse the same project database and domain',async()=>{
  const uuid='11111111-1111-4111-8111-111111111111',writes=[];
  const api=async(path,method='GET')=>{
    if(method!=='GET')writes.push(path);
    if(path.startsWith('/d1/database?'))return [{uuid,name:DATABASE}];
    if(path.endsWith('/domains'))return [{name:DOMAIN}];
    return {name:PROJECT,subdomain:`${PROJECT}.pages.dev`,deployment_configs:{production:{d1_databases:{DB:{id:uuid}}},preview:{d1_databases:{DB:{id:uuid}}}}};
  };
  await ensureProject(api);await attachDomain(api);assert.deepEqual(writes,[]);
});
test('API failures preserve a useful code without printing tokens or raw response content',async()=>{
  const token='fake-sensitive-test-value';
  const api=cloudflareAPI('test-account',token,async()=>Response.json({success:false,errors:[{code:9109,message:token}]},{status:403}));
  await assert.rejects(()=>api('/pages/projects'),error=>error.status===403&&error.message.includes('9109')&&error.message.includes('Cloudflare Pages Edit')&&!error.message.includes('D1 Edit')&&!error.message.includes(token));
});
test('local builds with credentials present still never deploy to the Cloudflare account',()=>{
  const result=spawnSync(process.execPath,['scripts/cloudflare_build.mjs'],{cwd:ROOT,encoding:'utf8',env:{...process.env,WORKERS_CI:'0',CLOUDFLARE_ACCOUNT_ID:'fake-test-account',CLOUDFLARE_API_TOKEN:'fake-test-token'}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Local build only/);
});

test('missing account variable uses authenticated Wrangler metadata without guessing between accounts',async()=>{
  const id='a'.repeat(32),environment={WORKERS_CI:'1',CLOUDFLARE_API_TOKEN:'fake-token'};
  const execute=(_node,args,options)=>{
    assert.deepEqual(args.slice(-2),['whoami','--json']);assert.equal(options.env.CLOUDFLARE_API_TOKEN,'fake-token');
    return {status:0,stdout:JSON.stringify({loggedIn:true,accounts:[{id,name:'not logged'}]})};
  };
  assert.equal(accountFromWrangler(environment,execute),id);
  let received;
  await runBuild({environment,build:()=>{},resolveAccount:()=>accountFromWrangler(environment,execute),deploy:async credentials=>{received=credentials;}});
  assert.deepEqual(received,{accountId:id,token:'fake-token'});
  assert.throws(()=>accountFromWrangler(environment,()=>({status:0,stdout:JSON.stringify({loggedIn:true,accounts:[{id},{id:'b'.repeat(32)}]})})),/více účtům/);
  assert.throws(()=>accountFromWrangler(environment,()=>({status:1,stdout:'private metadata must not be printed'})),/CLOUDFLARE_ACCOUNT_ID/);
});

test('missing token never starts account discovery or deployment and reports the exact configuration problem',async()=>{
  let calls=0;
  await assert.rejects(()=>runBuild({environment:{WORKERS_CI:'1'},build:()=>{},resolveAccount:()=>{calls++;},deploy:()=>{calls++;}}),error=>error.stage==='přístup k účtu Cloudflare'&&error.message.includes('CLOUDFLARE_API_TOKEN'));
  assert.equal(calls,0);
});

test('supported legacy variables work and an explicit account takes precedence over discovery',async()=>{
  let received;
  await runBuild({environment:{WORKERS_CI:'1',CF_ACCOUNT_ID:'a'.repeat(32),CF_API_TOKEN:'legacy-fake-token'},build:()=>{},resolveAccount:()=>{throw new Error('Must not discover');},deploy:async credentials=>{received=credentials;}});
  assert.equal(received.accountId,'a'.repeat(32));assert.equal(received.token,'legacy-fake-token');
});

test('original API error survives the top-level build wrapper without a token or multiline log injection',async()=>{
  const environment={WORKERS_CI:'1',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'private-fake-token'};
  await assert.rejects(()=>runBuild({environment,build:()=>{},deploy:async()=>{
    const error=new Error('GET D1: HTTP 403 code 9109\nprivate-fake-token');error.status=403;throw error;
  }}),error=>{
    const message=deploymentError(error,environment);
    assert.match(message,/MOJE_TEMPO_DEPLOY_ERROR/);assert.match(message,/HTTP 403 code 9109/);
    assert.ok(!message.includes('private-fake-token'));assert.ok(!message.includes('\n'));return true;
  });
});

test('Pages missing-project API code is handled even when its HTTP status is 400, while permissions errors still stop',async()=>{
  const uuid='11111111-1111-4111-8111-111111111111';let created=0;
  const api=async(path,method='GET')=>{
    if(path.startsWith('/d1/database?'))return [{uuid,name:DATABASE}];
    if(path===`/pages/projects/${PROJECT}`){const error=new Error('Project not found');error.status=400;error.code=8000007;throw error;}
    if(path==='/pages/projects'&&method==='POST'){created++;return {name:PROJECT,subdomain:`${PROJECT}.pages.dev`};}
    throw new Error('Unexpected call');
  };
  await ensureProject(api);assert.equal(created,1);
  await assert.rejects(()=>ensureProject(async path=>{
    if(path.startsWith('/d1/database?'))return [{uuid,name:DATABASE}];
    const error=new Error('Forbidden');error.status=403;throw error;
  }),error=>error.status===403);
});

test('the final Pages upload failure retains the actual CLI reason instead of a generic custom-build error',()=>{
  const error=wranglerFailure({status:1,stderr:'\u001b[31m✘ [ERROR] Authentication error [code: 10000]\u001b[0m\n  fake-token\n',stdout:''},{CLOUDFLARE_API_TOKEN:'fake-token'});
  assert.match(error.message,/Authentication error/);assert.match(error.message,/10000/);assert.ok(!error.message.includes('fake-token'));
  const missing=wranglerFailure({status:1,stderr:"Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild'",stdout:''});
  assert.match(missing.message,/ERR_MODULE_NOT_FOUND/);
});
