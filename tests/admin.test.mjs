import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {createHash,createCipheriv,randomBytes} from 'node:crypto';
import {accountRole} from '../worker/admin.mjs';

// Exercise the actual API handler and actual SQLite queries, including auth,
// schema initialization, owner selection, and pagination. No Cloudflare calls.
const directory=await mkdtemp(join(tmpdir(),'tempo-admin-tests-'));
const bundle=join(directory,'worker.mjs');
const invitationCode='A'.repeat(43),expiredCode='B'.repeat(43);
const encryptedFixture=(code,value)=>{
  const iv=randomBytes(12),key=createHash('sha256').update('moje-tempo-invitation:'+code).digest(),cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]);
  return {iv:iv.toString('base64'),data:data.toString('base64')};
};
const invitationFixture=[
  {id:'11111111-1111-4111-8111-111111111111',tokenHash:createHash('sha256').update(invitationCode).digest('hex'),expiresAt:'2099-01-01T00:00:00Z',payload:encryptedFixture(invitationCode,{name:'Testovací profil',milestone:{date:'2026-10-08',title:'Zkušební milník',note:'Osobní milník.'}})},
  {id:'22222222-2222-4222-8222-222222222222',tokenHash:createHash('sha256').update(expiredCode).digest('hex'),expiresAt:'2000-01-01T00:00:00Z',payload:{}},
];
await build({entryPoints:['worker/index.mjs'],outfile:bundle,bundle:true,format:'esm',platform:'neutral',loader:{'.sql':'text'},logLevel:'silent',plugins:[{name:'isolated-invitation-fixture',setup(b){b.onLoad({filter:/invitations\.config\.json$/},()=>({contents:JSON.stringify(invitationFixture),loader:'json'}));}}]});
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
    assert.ok(!files.includes('invitations.config.json'));
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

test('old installed clients preserve newer optional settings and explicit clearing still works',async()=>{
  const f=await fixture();
  try {
    const current=(await f.request('/api/diary',{user:f.owner})).body;
    Object.assign(current.state.settings,{trainingSince:'2016-10-23',restPeriods:[{id:'pause-test',start:'2026-10-29',end:'2026-11-03',label:'Volněji'}],habits:['mobility']});
    current.state.entries=[{id:'mobility-test',createdAt:'2026-10-29T12:00:00Z',date:'2026-10-29',type:'mobility',duration:15,title:'Mobilita',mobilityExercises:['dead-bug','custom:Moje kyčle']}];
    assert.equal((await f.request('/api/diary',{user:f.owner,method:'PUT',data:current})).status,200);
    const legacy=(await f.request('/api/diary',{user:f.owner})).body;
    for(const key of ['trainingSince','restPeriods','habits'])delete legacy.state.settings[key];
    legacy.state.settings.weeklyMinutes=180;
    assert.equal((await f.request('/api/diary',{user:f.owner,method:'PUT',data:legacy})).status,200);
    const restored=(await f.request('/api/diary',{user:f.owner})).body;
    for(const key of ['trainingSince','restPeriods','habits'])assert.deepEqual(restored.state.settings[key],current.state.settings[key]);
    assert.deepEqual(restored.state.entries[0].mobilityExercises,current.state.entries[0].mobilityExercises);
    assert.equal((await f.request('/api/diary',{user:f.owner,method:'PUT',data:legacy})).status,409);
    restored.state.settings.restPeriods=[];restored.state.settings.trainingSince='';
    assert.equal((await f.request('/api/diary',{user:f.owner,method:'PUT',data:restored})).status,200);
    assert.deepEqual((await f.request('/api/diary',{user:f.owner})).body.state.settings.restPeriods,[]);
    const invalid=(await f.request('/api/diary',{user:f.owner})).body;
    invalid.state.entries[0].mobilityExercises=['not-an-exercise'];
    assert.equal((await f.request('/api/diary',{user:f.owner,method:'PUT',data:invalid})).status,400);
  }finally{f.sqlite.close();}
});

test('invitation preview requires an unexpired private code and exposes no claim identity',async()=>{
  const f=await fixture();
  try {
    const preview=await f.request('/api/invitation/preview',{method:'POST',data:{code:invitationCode}});
    assert.equal(preview.status,200);
    assert.deepEqual(preview.body.milestone,{date:'2026-10-08',title:'Zkušební milník'});
    assert.equal(preview.body.available,true);
    assert.ok(!JSON.stringify(preview.body).includes('tokenHash'));
    for(const code of ['wrong','C'.repeat(43)])assert.equal((await f.request('/api/invitation/preview',{method:'POST',data:{code}})).status,404);
    assert.equal((await f.request('/api/invitation/preview',{method:'POST',data:{code:expiredCode}})).status,410);
  }finally{f.sqlite.close();}
});

test('invitation is accepted only by an authenticated personal account with matching header',async()=>{
  const f=await fixture();
  try {
    const data={code:invitationCode};f.env.ADMIN_ACCOUNT_ID=f.owner.id;
    assert.equal((await f.request('/api/invitation/accept',{method:'POST',data})).status,401);
    assert.equal((await f.request('/api/invitation/accept',{user:f.ordinary,method:'POST',data,header:false})).status,409);
    assert.equal((await f.request('/api/invitation/accept',{user:f.owner,method:'POST',data})).status,403);
    const result=await f.request('/api/invitation/accept',{user:f.ordinary,method:'POST',data});
    assert.equal(result.status,200);
    const diary=(await f.request('/api/diary',{user:f.ordinary})).body.state;
    assert.equal(diary.entries.length,1);
    assert.equal(diary.entries[0].type,'moment');assert.equal(diary.entries[0].duration,0);
    assert.equal(diary.entries[0].date,'2026-10-08');assert.equal(diary.entries[0].title,'Zkušební milník');
    assert.equal(diary.settings.name,'Testovací profil');assert.equal(diary.onboardingComplete,true);
    assert.equal((await f.request('/api/session',{user:f.ordinary})).body.user.role,'user');
    assert.equal((await f.request('/api/invitation/accept',{user:f.owner,method:'POST',data})).status,403);
  }finally{f.sqlite.close();}
});

test('an invitation belongs to one account and repeated use never duplicates or resurrects its moment',async()=>{
  const f=await fixture();
  try {
    const data={code:invitationCode};
    assert.equal((await f.request('/api/invitation/accept',{user:f.ordinary,method:'POST',data})).status,200);
    assert.equal((await f.request('/api/invitation/accept',{user:f.owner,method:'POST',data})).status,409);
    const preview=(await f.request('/api/invitation/preview',{user:f.owner,method:'POST',data})).body;
    assert.equal(preview.available,false);assert.equal(preview.alreadyApplied,false);
    assert.ok(!JSON.stringify(preview).includes(f.ordinary.id));
    const ownPreview=(await f.request('/api/invitation/preview',{user:f.ordinary,method:'POST',data})).body;
    assert.equal(ownPreview.alreadyApplied,true);
    const remote=(await f.request('/api/diary',{user:f.ordinary})).body;
    remote.state.entries=[];
    assert.equal((await f.request('/api/diary',{user:f.ordinary,method:'PUT',data:remote})).status,200);
    assert.equal((await f.request('/api/invitation/accept',{user:f.ordinary,method:'POST',data})).body.alreadyApplied,true);
    assert.equal((await f.request('/api/diary',{user:f.ordinary})).body.state.entries.length,0);
  }finally{f.sqlite.close();}
});

test('invitation appends its moment and preserves existing entries goals name and habits',async()=>{
  const f=await fixture();
  try {
    const remote=(await f.request('/api/diary',{user:f.ordinary})).body;
    remote.state.settings={...remote.state.settings,name:'Moje vlastní jméno',dailySteps:5000,habits:['vitamins']};
    remote.state.entries=[{id:'my-existing-entry',type:'walking',date:'2026-10-08',duration:30,steps:1000,note:'Keep me',createdAt:'2026-10-08T12:00:00Z'}];
    assert.equal((await f.request('/api/diary',{user:f.ordinary,method:'PUT',data:remote})).status,200);
    const before=(await f.request('/api/diary',{user:f.ordinary})).body.state;
    assert.equal((await f.request('/api/invitation/accept',{user:f.ordinary,method:'POST',data:{code:invitationCode}})).status,200);
    const after=(await f.request('/api/diary',{user:f.ordinary})).body.state;
    assert.deepEqual(after.entries[0],before.entries[0]);assert.equal(after.entries.length,2);
    assert.equal(after.settings.name,before.settings.name);assert.equal(after.settings.dailySteps,5000);assert.deepEqual(after.settings.habits,['vitamins']);
  }finally{f.sqlite.close();}
});

test('racing personal accounts cannot both claim a single invitation',async()=>{
  const f=await fixture();
  try {
    const responses=await Promise.all([f.owner,f.ordinary].map(user=>f.request('/api/invitation/accept',{user,method:'POST',data:{code:invitationCode}})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const diaries=await Promise.all([f.owner,f.ordinary].map(user=>f.request('/api/diary',{user})));
    assert.equal(diaries.reduce((total,r)=>total+r.body.state.entries.length,0),1);
  }finally{f.sqlite.close();}
});

test('an invitation reserved during a concurrent diary change can be safely retried',async()=>{
  const f=await fixture();
  try {
    const original=f.db.batch;let injected=false;
    f.db.batch=async statements=>{
      if(!injected){injected=true;f.sqlite.prepare('UPDATE diaries SET revision=revision+1 WHERE account_id=?').run(f.ordinary.id);}
      return original(statements);
    };
    const data={code:invitationCode};
    assert.equal((await f.request('/api/invitation/accept',{user:f.ordinary,method:'POST',data})).status,409);
    const preview=(await f.request('/api/invitation/preview',{user:f.ordinary,method:'POST',data})).body;
    assert.equal(preview.available,true);assert.equal(preview.alreadyApplied,false);
    assert.equal((await f.request('/api/invitation/accept',{user:f.ordinary,method:'POST',data})).status,200);
    const diary=(await f.request('/api/diary',{user:f.ordinary})).body.state;
    assert.equal(diary.entries.length,1);
  }finally{f.sqlite.close();}
});
