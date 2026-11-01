import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildOlda} from '../scripts/build_olda.mjs';
import {ensureOldaBinding} from '../scripts/cloudflare_build.mjs';
test('the original Olda app retains its original renderer gift and CSS and packages the common engine without private data',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'olda-original-artifact-'));
  try {
    await buildOlda({output:directory});
    const html=await readFile(join(directory,'index.html'),'utf8'),worker=await readFile(join(directory,'_worker.js'),'utf8'),files=await readdir(directory,{recursive:true});
    assert.ok(html.includes('window.OldaOriginal={home,icon'));assert.ok(html.includes('VŠECHNO NEJLEPŠÍ KE ČTYŘICÍTCE'));assert.ok(html.includes('.hero:after'));assert.ok(html.includes('tempo-diary" content="olda'));
    const seed=JSON.parse(html.match(/<script id="itfit-data" type="application\/json">([^<]+)<\/script>/)[1]);assert.equal(seed.sessions.length,0);assert.equal(seed.days.length,0);assert.equal(seed.profile.birthday,'2000-01-01');assert.equal(seed.profile.signature,'Tvůj tým');
    assert.ok(worker.includes('diary_links'));assert.ok(!worker.includes('COACH_KEY_HASH'));assert.ok(!files.some(f=>f.includes('PRIVATE')||f.includes('work/')||f.endsWith('.sqlite')));
    assert.deepEqual(JSON.parse(await readFile(join(directory,'_routes.json'),'utf8')),{version:1,include:['/*'],exclude:[]});
    const sw=await readFile(join(directory,'service-worker.js'),'utf8');assert.ok(sw.includes('olda-shared.mjs'));assert.ok(sw.includes('tempo-app.js'));assert.ok(!sw.includes('__TEMPO_VERSION__'));assert.ok(!sw.includes('__TEMPO_INTEGRITY__'));
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('Olda cutover reuses the single database and refuses an unlinked owner',async()=>{
  const calls=[],database={uuid:'shared-db'};
  const project={name:'olda-itfit',subdomain:'olda-itfit.pages.dev',deployment_configs:{}};
  const api=async(path,method='GET',data)=>{calls.push({path,method,data});if(path==='/pages/projects/olda-itfit'&&method==='GET')return project;if(path.includes('/query'))return [{results:[{id:'olda'}]}];return project;};
  await ensureOldaBinding(api,database);
  const patch=calls.find(c=>c.method==='PATCH');assert.equal(patch.data.deployment_configs.production.d1_databases.DB.id,'shared-db');assert.ok(!calls.some(c=>c.method==='POST'&&c.path==='/d1/database'));
  await assert.rejects(()=>ensureOldaBinding(async path=>path.includes('/query')?[{results:[]}]:project,database),/skutečný Oldův účet/);
});
