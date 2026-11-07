import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {testDatabase} from './test-db.mjs';
import {emptyDiary} from '../sync-rules.mjs';
import {validateEntry} from '../domain.mjs';
const directory=await mkdtemp(join(tmpdir(),'public-olda-test-'));
await build({entryPoints:['clients/olda/server/shared-worker.mjs','worker/index.mjs'],outdir:directory,bundle:true,format:'esm',platform:'neutral',outExtension:{'.js':'.mjs'},loader:{'.sql':'text'},logLevel:'silent'});
const publicWorker=(await import(pathToFileURL(join(directory,'clients/olda/server/shared-worker.mjs')))).default;
const privateWorker=(await import(pathToFileURL(join(directory,'worker/index.mjs')))).default;
await rm(directory,{recursive:true,force:true});

test('only the original deployment publishes its linked diary and referenced photographs; all writes still require authentication',async()=>{
 const {db,sqlite}=testDatabase(),env={DB:db};
 const request=(worker,path,{method='GET',data,headers={}}={})=>worker.fetch(new Request('https://diary.test'+path,{method,headers:{...headers,...(method!=='GET'?{Origin:'https://diary.test','Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);
 try{
  const users=[];
  for(const login of ['owner@example.test','coach@example.test','other@example.test']){
   const response=await request(privateWorker,'/api/register',{method:'POST',data:{login,password:'Only-isolated-fixture-2026!'}});assert.equal(response.status,201);const {user}=await response.json();users.push({...user,cookie:response.headers.get('Set-Cookie').split(';')[0]});
  }
  const [owner,coach,other]=users;
  await db.prepare('INSERT INTO diary_links VALUES(?,?,?,?)').bind('olda',owner.id,coach.id,Date.now()).run();
  const state=emptyDiary();state.entries=[validateEntry({id:'shared-training',type:'strength',date:'2026-10-21',duration:0,durationUnknown:true,together:true,title:'Zapsaný trénink',photoId:'visible',workout:{focus:'unspecified',splitName:'',exercises:[{name:'Testovací přítah',pattern:'horizontal_pull',sets:0,setsUnknown:true}]}}).entry];
  await db.prepare('UPDATE diaries SET revision=7,state=? WHERE account_id=?').bind(JSON.stringify(state),owner.id).run();
  const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2]);
  for(const [account,id] of [[owner,'visible'],[owner,'unreferenced'],[other,'other-photo']])await db.prepare('INSERT INTO photos VALUES(?,?,?,?,?)').bind(account.id,id,'image/png',png.buffer,Date.now()).run();
  const anonymous=await request(publicWorker,'/api/public-diary'),payload=await anonymous.json();assert.equal(anonymous.status,200);assert.deepEqual(payload,{revision:7,state});assert.equal(anonymous.headers.get('Cache-Control'),'no-store');assert.equal(anonymous.headers.get('X-Robots-Tag'),'noindex, nofollow');assert.equal(anonymous.headers.get('Access-Control-Allow-Origin'),null);
  assert.deepEqual(Object.keys(payload).sort(),['revision','state']);
  const photo=await request(publicWorker,'/api/public-photos/visible');assert.equal(photo.status,200);assert.deepEqual(new Uint8Array(await photo.arrayBuffer()),png);
  for(const id of ['unreferenced','other-photo','missing'])assert.equal((await request(publicWorker,'/api/public-photos/'+id)).status,404);
  assert.equal((await request(privateWorker,'/api/public-diary',{headers:{'X-Tempo-Diary':'olda','X-Tempo-Account':owner.id}})).status,404);
  assert.equal((await request(publicWorker,'/api/diary')).status,401);
  for(const path of ['/api/diary','/api/photos/visible'])assert.equal((await request(publicWorker,path,{method:'PUT',data:{revision:7,state},headers:{'X-Tempo-Account':owner.id}})).status,401);
  assert.equal((await request(publicWorker,'/api/public-diary',{method:'PUT',data:{revision:7,state}})).status,405);
  assert.equal((await request(publicWorker,'/api/public-photos/visible',{method:'PUT',data:{}})).status,405);
  const auth={Cookie:coach.cookie,'X-Tempo-Account':coach.id};const saved=await request(publicWorker,'/api/diary',{method:'PUT',data:{revision:7,state},headers:auth});assert.equal(saved.status,200);
  assert.equal((await (await request(publicWorker,'/api/public-diary')).json()).revision,8);
  assert.equal((await request(publicWorker,'/api/diary',{headers:{Cookie:other.cookie,'X-Tempo-Account':other.id}})).status,403);
  await db.prepare('DELETE FROM diary_links WHERE id=?').bind('olda').run();assert.equal((await request(publicWorker,'/api/public-diary')).status,404);
 }finally{sqlite.close();}
});
