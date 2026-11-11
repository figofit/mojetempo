import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDiary,accountRecordWithRecovery} from '../sync-rules.mjs';
import {recoveryPage} from '../worker/recovery.mjs';

test('restoring a healthy account preserves an invalid local draft atomically, including photos and pending flags',()=>{
 const draft={state:{entries:[{id:'pending',photoId:'local-photo',workout:{exercises:[{name:'Unfinished',sets:0}]}}]},base:{version:0},revision:3,dirty:true,uploaded:['local-photo']};
 const original=structuredClone(draft),remote={revision:8,state:emptyDiary()},result=accountRecordWithRecovery(draft,remote,'2026-11-11T10:00:00.000Z');
 assert.deepEqual(result.state,remote.state);assert.equal(result.revision,8);assert.equal(result.dirty,false);assert.deepEqual(result.localRecovery,[{capturedAt:'2026-11-11T10:00:00.000Z',record:original}]);assert.deepEqual(draft,original);
 const again=accountRecordWithRecovery(result,{revision:9,state:emptyDiary()});assert.equal(again.localRecovery.length,2);assert.deepEqual(again.localRecovery[0].record,original);assert.equal(again.localRecovery[1].record.localRecovery,undefined);
});

test('invalid server snapshots cannot replace the draft and an initial restore invents no local backup',()=>{
 const draft={state:{entries:'damaged'},dirty:true},before=structuredClone(draft);
 for(const remote of [null,{revision:-1,state:emptyDiary()},{revision:2,state:{...emptyDiary(),entries:null}},{revision:2,state:{...emptyDiary(),version:0}}])assert.throws(()=>accountRecordWithRecovery(draft,remote));assert.deepEqual(draft,before);
 assert.deepEqual(accountRecordWithRecovery(null,{revision:2,state:emptyDiary()}).localRecovery,[]);
});

test('network recovery is uncached and has an explicit update action without touching diary storage',async()=>{
 const response=recoveryPage(),html=await response.text();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');assert.ok(html.includes('Aktualizovat a otevřít deník'));assert.ok(html.includes('registration.unregister()'));assert.ok(!html.includes('indexedDB'));assert.ok(!html.includes('caches.delete'));assert.ok(!html.includes('localStorage.clear'));
});
