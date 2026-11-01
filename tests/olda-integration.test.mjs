import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {testDatabase} from './test-db.mjs';
import {convertOldaBoard} from '../legacy-olda.mjs';
import {emptyDiary,mergeDiaries} from '../sync-rules.mjs';
import {personalSettings} from '../personal.mjs';
import {habitSettings,toggleHabit} from '../habits.mjs';
import {validateEntry} from '../domain.mjs';
const dir=await mkdtemp(join(tmpdir(),'olda-shared-test-'));
await build({entryPoints:['worker/index.mjs'],outfile:join(dir,'worker.mjs'),bundle:true,format:'esm',platform:'neutral',loader:{'.sql':'text'},logLevel:'silent'});
const worker=(await import(pathToFileURL(join(dir,'worker.mjs')))).default;
await rm(dir,{recursive:true,force:true});
const legacy=()=>({schemaVersion:1,clientId:'olda-4-0',revision:'fixture',updatedAt:null,profile:{name:'Testovací profil',salutation:'Ahoj',birthday:'2001-01-02',age:40,startDate:'2026-10-21',dedication:'Přání',signature:'Testovací podpis',vaultUrl:''},plan:{title:'Plán A',focus:'Technika',notes:'Pokyn',exercises:[{name:'Můj cvik',dose:'3 × 8',note:'Pomalu'}]},habits:[{id:'voda',name:'Vlastní návyk',note:'Domluva',target:4,archived:false}],sessions:[{id:'first',date:'2026-10-21',category:'strength',title:'Společný trénink',minutes:0,together:true,note:'Beze stopek',exercises:[{name:'Můj cvik',sets:3,reps:8,weight:17.5},{name:'Dlouhý cvik',sets:0,reps:0,weight:0}]}],days:[{date:'2026-10-21',habits:['voda'],steps:8400,energy:4,note:'Skutečný zápis'}],milestones:[{id:'moment',date:'2026-10-21',title:'Začátek',note:'Poznámka'}]});
test('legacy conversion preserves unknown time, reps, load, coach flag, energy, custom habits and plan; IDs are stable',()=>{
  const board=legacy(),a=convertOldaBoard(board),b=convertOldaBoard(board,a.state);
  assert.equal(a.state.entries.length,3);assert.equal(b.state.entries.length,3);assert.equal(b.preview.added,0);
  const session=a.state.entries.find(e=>e.type==='strength');assert.equal(session.duration,0);assert.equal(session.durationUnknown,true);assert.equal(session.together,true);assert.equal(session.workout.exercises[0].reps,8);assert.equal(session.workout.exercises[0].weight,17.5);assert.equal(session.workout.exercises[1].sets,0);
  assert.equal(a.state.entries.find(e=>e.type==='day').energy,4);assert.equal(a.state.entries.find(e=>e.type==='day').steps,8400);assert.deepEqual(a.state.settings.personalPlan,board.plan);assert.equal(a.state.settings.customHabits[0].target,4);assert.equal(habitSettings(a.state.settings).habitChecks.length,1);
  assert.deepEqual(board,legacy());
  board.sessions[0].category='mobility';assert.equal(convertOldaBoard(board).state.entries[0].exerciseDetails[0].weight,17.5);
});
test('independent offline custom fields, definitions, checks and activities merge; same-entry edits conflict',()=>{
  const base=convertOldaBoard(legacy()).state,l=structuredClone(base),r=structuredClone(base);
  l.settings.personalFields=[{id:'field-pain',name:'Pocit',type:'text',unit:''}];r.settings.customHabits.push({id:'custom-sleep',name:'Spánek',note:'',target:5,archived:false});r.settings.habits.push('custom-sleep');Object.assign(r.settings,toggleHabit(r.settings,'custom-sleep','2026-10-22'));
  l.entries.push(validateEntry({id:'left',type:'walking',date:'2026-10-22',duration:30,values:{'field-pain':'Dobré'}}).entry);
  const merged=mergeDiaries(base,l,r);assert.equal(merged.settings.personalFields.length,1);assert.equal(merged.settings.customHabits.length,2);assert.equal(merged.settings.habitChecks.length,2);assert.equal(merged.entries.at(-1).values['field-pain'],'Dobré');
  l.entries[0].note='Levá změna';r.entries[0].note='Pravá změna';assert.throws(()=>mergeDiaries(base,l,r),/Stejný údaj/);
  assert.throws(()=>personalSettings({customHabits:[{id:'bad'}]}));
});
test('two actual origins share the same owner diary and photo; coach delegation is scoped, versioned and revocable',async()=>{
  const {db,sqlite}=testDatabase(),env={DB:db};
  const request=async(host,path,{user,method='GET',data,scope,origin,photo}={})=>{
    const headers={...(user?{Cookie:user.cookie,'X-Tempo-Account':user.id}:{}),...(scope?{'X-Tempo-Diary':scope}:{})};
    if(method!=='GET'){headers.Origin=origin||host;headers['Content-Type']=photo?'image/png':'application/json';}
    return worker.fetch(new Request(host+path,{method,headers,...(data!==undefined?{body:JSON.stringify(data)}:photo?{body:photo}:{})}),{...env,...(host.includes('olda.')?{OLDA_DIARY:'olda'}:{})});
  };
  const register=async(login)=>{const res=await request('https://moje.test','/api/register',{method:'POST',data:{login,password:'Only-isolated-fixture-2026!'}});assert.equal(res.status,201);const data=await res.json();return {...data.user,cookie:res.headers.get('Set-Cookie').split(';')[0]};};
  const owner=await register('olda@example.test'),coach=await register('coach@example.test'),stranger=await register('other@example.test');
  await db.prepare('INSERT INTO diary_links VALUES(?,?,?,?)').bind('olda',owner.id,coach.id,Date.now()).run();env.ADMIN_ACCOUNT_ID=stranger.id;
  assert.equal((await request('https://olda.test','/api/diary')).status,401);
  assert.equal((await request('https://olda.test','/api/diary',{user:stranger})).status,403);
  assert.equal((await request('https://moje.test','/api/diary',{user:stranger,scope:'olda'})).status,403);
  const payload=convertOldaBoard(legacy()).state;
  const save=await request('https://olda.test','/api/diary',{user:coach,method:'PUT',data:{revision:0,state:payload}});assert.equal(save.status,200);assert.equal((await save.json()).revision,1);
  let second=await (await request('https://moje.test','/api/diary',{user:owner})).json();assert.deepEqual(second.state,payload);
  assert.equal((await request('https://olda.test','/api/diary',{user:coach,method:'PUT',data:{revision:0,state:payload}})).status,409);
  second.state.entries[0].workout.exercises[0].reps=10;second.state.settings.modules=['movement','chronicle'];
  assert.equal((await request('https://moje.test','/api/diary',{user:owner,method:'PUT',data:{revision:1,state:second.state}})).status,200);
  const back=await (await request('https://olda.test','/api/diary',{user:coach})).json();assert.equal(back.state.entries[0].workout.exercises[0].reps,10);assert.equal(back.state.entries.length,3);assert.deepEqual(back.state.settings.modules,['movement','chronicle']);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM diary_history WHERE account_id=?').get(owner.id).n,2);
  assert.equal((await request('https://olda.test','/api/diary',{user:coach,method:'PUT',origin:'https://evil.test',data:{revision:2,state:back.state}})).status,403);
  // Minimal PNG signature is enough for byte preservation here; the browser UI compresses actual images.
  const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
  assert.equal((await request('https://olda.test','/api/photos/shared-photo',{user:coach,method:'PUT',photo:png})).status,201);
  assert.deepEqual(new Uint8Array(await (await request('https://moje.test','/api/photos/shared-photo',{user:owner})).arrayBuffer()),png);
  assert.equal((await request('https://moje.test','/api/photos/shared-photo',{user:stranger})).status,404);
  const ownCoach=await (await request('https://moje.test','/api/diary',{user:coach})).json();assert.equal(ownCoach.state.entries.length,0);
  await db.prepare('DELETE FROM diary_links WHERE id=?').bind('olda').run();assert.equal((await request('https://olda.test','/api/diary',{user:coach})).status,403);
  assert.equal((await request('https://moje.test','/api/diary',{user:owner})).status,200);
});

