import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {accountRole} from '../worker/admin.mjs';

// Exercise the actual API handler and actual SQLite queries, including auth,
// schema initialization, owner selection, and pagination. No Cloudflare calls.
const directory=await mkdtemp(join(tmpdir(),'tempo-admin-tests-'));
const bundle=join(directory,'worker.mjs');
await build({entryPoints:['worker/index.mjs'],outfile:bundle,bundle:true,format:'esm',platform:'neutral',loader:{'.sql':'text'},logLevel:'silent'});
const worker=(await import(pathToFileURL(bundle))).default;
await rm(directory,{recursive:true,force:true});

test('trusted deployment fallback selects only its exact account and explicit env revokes it',()=>{
  const owner={id:'11111111-1111-4111-8111-111111111111'};
  const configuration={accountId:owner.id};
  assert.equal(accountRole(owner,{},configuration),'admin');
  assert.equal(accountRole({id:'22222222-2222-4222-8222-222222222222'},{},configuration),'user');
  for(const value of [undefined,null,'','invalid',owner.id+' '])assert.equal(accountRole(owner,{ADMIN_ACCOUNT_ID:value},configuration),'user');
  assert.equal(accountRole(owner,{ADMIN_ACCOUNT_ID:owner.id},{accountId:null}),'admin');
  assert.equal(accountRole(owner,{},null),'user');
});

test('trusted admin configuration is excluded from the public app artifact',async()=>{
  const output=await mkdtemp(join(tmpdir(),'tempo-admin-public-test-'));
  try {
    const result=spawnSync('python3',['scripts/build_site.py','--output-dir',output],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const files=await readdir(output,{recursive:true});
    assert.ok(!files.includes('admin.config.json'));
    assert.ok(!files.some(file=>file.startsWith('worker/')));
  }finally{await rm(output,{recursive:true,force:true});}
});

function database() {
  const sqlite=new DatabaseSync(':memory:');
  const db={
    prepare(sql) {
      const bound=(values=[])=>({
        bind:(...next)=>bound(next),
        first:async()=>sqlite.prepare(sql).get(...values)||null,
        all:async()=>({results:sqlite.prepare(sql).all(...values)}),
        run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}),
      });
      return bound();
    },
    batch:async statements=>{const results=[];for(const statement of statements)results.push(await statement.run());return results;},
    withSession:()=>db,
  };
  return {db,sqlite};
}

async function fixture() {
  const {db,sqlite}=database();
  const env={DB:db};
  async function request(path,{user,method='GET',data,header=true}={}) {
    const headers={...(user?{Cookie:user.cookie}:{}),...(user&&header?{'X-Tempo-Account':user.id}:{})};
    if(method!=='GET'){headers.Origin='https://tempo.test';headers['Content-Type']='application/json';}
    const response=await worker.fetch(new Request(`https://tempo.test${path}`,{method,headers,...(data===undefined?{}:{body:JSON.stringify(data)})}),env);
    return {status:response.status,headers:response.headers,body:await response.json()};
  }
  const password='Strong-test-password-42';
  async function register(login) {
    const response=await request('/api/register',{method:'POST',data:{login,password,role:'admin'}});
    assert.equal(response.status,201);
    return {...response.body.user,cookie:response.headers.get('Set-Cookie').split(';')[0],recoveryCode:response.body.recoveryCode};
  }
  const owner=await register('owner@example.test');
  const ordinary=await register('ordinary@example.test');
  return {db,sqlite,env,request,owner,ordinary,password};
}

test('registration never grants admin by order, submitted role, or login address',async()=>{
  const f=await fixture();
  try {
    assert.equal(f.owner.role,'user');assert.equal(f.ordinary.role,'user');
    for(const setting of [undefined,'owner@example.test',f.owner.id+' ',f.ordinary.id.toUpperCase()]) {
      f.env.ADMIN_ACCOUNT_ID=setting;
      assert.equal((await f.request('/api/session',{user:f.owner})).body.user.role,'user');
    }
    f.env.ADMIN_ACCOUNT_ID=f.owner.id;
    assert.equal((await f.request('/api/session',{user:f.owner})).body.user.role,'admin');
    assert.equal((await f.request('/api/session',{user:f.ordinary})).body.user.role,'user');
  }finally{f.sqlite.close();}
});

test('login and password recovery return the same server-authorized role',async()=>{
  const f=await fixture();
  try {
    f.env.ADMIN_ACCOUNT_ID=f.owner.id;
    const login=await f.request('/api/login',{method:'POST',data:{login:f.owner.login,password:f.password}});
    assert.equal(login.status,200);assert.equal(login.body.user.role,'admin');
    const recovery=await f.request('/api/recover',{method:'POST',data:{login:f.owner.login,password:f.password+'new',recoveryCode:f.owner.recoveryCode}});
    assert.equal(recovery.status,200);assert.equal(recovery.body.user.role,'admin');
    assert.deepEqual(Object.keys(recovery.body.user).sort(),['id','login','role']);
  }finally{f.sqlite.close();}
});

test('admin overview requires a valid owner session and the matching account header',async()=>{
  const f=await fixture();
  try {
    f.env.ADMIN_ACCOUNT_ID=f.owner.id;
    assert.equal((await f.request('/api/admin/overview')).status,401);
    assert.equal((await f.request('/api/admin/overview',{user:f.ordinary})).status,403);
    assert.equal((await f.request('/api/admin/overview',{user:{...f.ordinary,id:f.owner.id}})).status,409);
    assert.equal((await f.request('/api/admin/overview',{user:f.owner,header:false})).status,409);
    const authorized=await f.request('/api/admin/overview',{user:f.owner});
    assert.equal(authorized.status,200);assert.equal(authorized.headers.get('Cache-Control'),'no-store');
  }finally{f.sqlite.close();}
});

test('overview exposes bounded account metadata and totals without diary or authentication contents',async()=>{
  const f=await fixture();
  try {
    f.env.ADMIN_ACCOUNT_ID=f.owner.id;
    f.sqlite.prepare('UPDATE diaries SET state=?,revision=1 WHERE account_id=?').run('{"private_health_note":"DO_NOT_DISCLOSE_DIARY"}',f.ordinary.id);
    f.sqlite.prepare('INSERT INTO photos(account_id,id,mime,bytes,created_at) VALUES(?,?,?,?,?)').run(f.ordinary.id,'private-photo','image/jpeg',Buffer.from('DO_NOT_DISCLOSE_PHOTO'),Date.now());
    const response=await f.request('/api/admin/overview',{user:f.owner});
    assert.deepEqual(response.body.totals,{accounts:2,accountsWithSyncedDiary:1,photoBytes:Buffer.byteLength('DO_NOT_DISCLOSE_PHOTO')});
    assert.equal(response.body.users.length,2);
    for(const user of response.body.users)assert.deepEqual(Object.keys(user).sort(),['createdAt','id','login','role']);
    const serialized=JSON.stringify(response.body);
    for(const privateValue of ['DO_NOT_DISCLOSE','password_hash','recovery_hash','salt',f.owner.recoveryCode,f.owner.cookie])assert.ok(!serialized.includes(privateValue));
  }finally{f.sqlite.close();}
});

test('overview paginates with stable ordering and rejects invalid offsets',async()=>{
  const f=await fixture();
  try {
    f.env.ADMIN_ACCOUNT_ID=f.owner.id;
    const insert=f.sqlite.prepare('INSERT INTO accounts(id,login,password_hash,salt,recovery_hash,created_at) VALUES(?,?,?,?,?,?)');
    for(let index=0;index<55;index++)insert.run(crypto.randomUUID(),`test-${index}@example.test`,'hash','salt','recovery',Date.now()+index);
    const first=(await f.request('/api/admin/overview',{user:f.owner})).body;
    assert.equal(first.users.length,50);assert.equal(first.nextOffset,50);
    const last=(await f.request('/api/admin/overview?offset=50',{user:f.owner})).body;
    assert.equal(last.users.length,7);assert.equal(last.nextOffset,null);
    assert.equal(new Set([...first.users,...last.users].map(user=>user.id)).size,57);
    for(const invalid of ['-1','1.5','abc','1000001'])assert.equal((await f.request(`/api/admin/overview?offset=${invalid}`,{user:f.owner})).status,400);
  }finally{f.sqlite.close();}
});

test('removing owner configuration immediately revokes authority from an existing session',async()=>{
  const f=await fixture();
  try {
    f.env.ADMIN_ACCOUNT_ID=f.owner.id;
    assert.equal((await f.request('/api/admin/overview',{user:f.owner})).status,200);
    delete f.env.ADMIN_ACCOUNT_ID;
    assert.equal((await f.request('/api/session',{user:f.owner})).body.user.role,'user');
    assert.equal((await f.request('/api/admin/overview',{user:f.owner})).status,403);
  }finally{f.sqlite.close();}
});

test('account writes preserve the exercise library and reject unrecognized favorites',async()=>{
  const f=await fixture();
  try {
    const current=(await f.request('/api/diary',{user:f.owner})).body;
    const custom={id:'custom-test-row',name:'Můj přítah',pattern:'horizontal_pull'};
    current.state.settings.customExercises=[custom];
    current.state.settings.favoriteExercises=['goblet-squat',custom.id];
    const saved=await f.request('/api/diary',{user:f.owner,method:'PUT',data:current});
    assert.equal(saved.status,200);
    const restored=(await f.request('/api/diary',{user:f.owner})).body;
    assert.deepEqual(restored.state.settings.customExercises,[custom]);
    assert.deepEqual(restored.state.settings.favoriteExercises,['goblet-squat',custom.id]);
    assert.deepEqual((await f.request('/api/diary',{user:f.ordinary})).body.state.settings.customExercises,[]);
    restored.state.settings.favoriteExercises=['not-an-exercise'];
    assert.equal((await f.request('/api/diary',{user:f.owner,method:'PUT',data:restored})).status,400);
    assert.deepEqual((await f.request('/api/diary',{user:f.owner})).body.state.settings.favoriteExercises,['goblet-squat',custom.id]);
  }finally{f.sqlite.close();}
});

test('account writes preserve weekly plans and completion checks with independent server validation',async()=>{
  const f=await fixture();
  try {
    const current=(await f.request('/api/diary',{user:f.owner})).body;
    const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
    const plan={id:'plan-my-walk',weekday:0,label:'Procházka',type:'walking'};
    const completed={id:`${date}:${plan.id}`,date,planId:plan.id};
    current.state.settings.weeklyPlan=[plan];current.state.settings.planChecks=[completed];
    const saved=await f.request('/api/diary',{user:f.owner,method:'PUT',data:current});
    assert.equal(saved.status,200);
    const restored=(await f.request('/api/diary',{user:f.owner})).body;
    assert.deepEqual(restored.state.settings.weeklyPlan,[plan]);
    assert.deepEqual(restored.state.settings.planChecks,[completed]);
    restored.state.settings.weeklyPlan[0].weekday=7;
    assert.equal((await f.request('/api/diary',{user:f.owner,method:'PUT',data:restored})).status,400);
    restored.state.settings.weeklyPlan[0].weekday=0;
    restored.state.settings.planChecks[0].id='forged-check-id';
    assert.equal((await f.request('/api/diary',{user:f.owner,method:'PUT',data:restored})).status,400);
    assert.deepEqual((await f.request('/api/diary',{user:f.owner})).body.state.settings.planChecks,[completed]);
  }finally{f.sqlite.close();}
});
