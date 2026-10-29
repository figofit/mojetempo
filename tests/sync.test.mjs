import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDiary,mergeDiaries,same} from '../sync-rules.mjs';
const entry=id=>({id,type:'walking',date:'2026-10-29',duration:20,title:id});
const diary=(entries=[],settings={})=>({...emptyDiary(),entries,settings:{...emptyDiary().settings,...settings}});
test('independent offline entries from two devices merge without loss',()=>{
  const result=mergeDiaries(diary(),diary([entry('phone')]),diary([entry('windows')]));
  assert.deepEqual(result.entries.map(e=>e.id).sort(),['phone','windows']);
});
test('a deletion stays deleted while independent new entries survive',()=>{
  assert.deepEqual(mergeDiaries(diary([entry('old')]),diary(),diary([entry('old'),entry('new')])).entries,[entry('new')]);
});
test('different goal fields merge; concurrent edits of the same goal are rejected',()=>{
  const result=mergeDiaries(diary(),diary([],{dailySteps:5000}),diary([],{weeklyMinutes:200}));
  assert.equal(result.settings.dailySteps,5000);assert.equal(result.settings.weeklyMinutes,200);
  assert.throws(()=>mergeDiaries(diary(),diary([],{dailySteps:5000}),diary([],{dailySteps:9000})),/dvou zařízeních/);
});
test('concurrent deletion and edit of the same entry cannot silently lose either change',()=>{
  assert.throws(()=>mergeDiaries(diary([entry('old')]),diary(),diary([{...entry('old'),title:'edited'}])),/dvou zařízeních/);
});
test('stable equality and merge ignore JSON object key order',()=>{
  assert.ok(same({a:1,b:[2,3]},{b:[2,3],a:1}));assert.ok(!same([1,2],[2,1]));
  assert.ok(same(diary(),mergeDiaries(diary(),diary(),diary())));
});
