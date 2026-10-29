import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildPublic,preparePages,ROOT} from '../scripts/build_pages.mjs';
import {cloudflareAPI,ensureProject,attachDomain,PROJECT,DOMAIN,DATABASE} from '../scripts/cloudflare_build.mjs';

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
  await assert.rejects(()=>api('/pages/projects'),error=>error.status===403&&error.message.includes('9109')&&!error.message.includes(token));
});
test('local builds with credentials present still never deploy to the Cloudflare account',()=>{
  const result=spawnSync(process.execPath,['scripts/cloudflare_build.mjs'],{cwd:ROOT,encoding:'utf8',env:{...process.env,WORKERS_CI:'0',CLOUDFLARE_ACCOUNT_ID:'fake-test-account',CLOUDFLARE_API_TOKEN:'fake-test-token'}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Local build only/);
});
