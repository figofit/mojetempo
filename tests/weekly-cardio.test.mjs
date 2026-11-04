import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDiary,mergeDiaries} from '../sync-rules.mjs';
import {personalSettings} from '../personal.mjs';
import {answerCardio,cardioWeek,renderCardioRoutine} from '../training-routine.mjs';
import {computeTrainingStats,jointTrainingHistory,validateEntry} from '../domain.mjs';
const today='2026-11-04';
function fixture(){const state=emptyDiary();state.settings.weeklyCardio={target:2,label:'Cardio sports',since:'2026-10-26'};return state;}
const log=input=>validateEntry({duration:0,durationUnknown:true,...input},today).entry;

test('two weekly cardio ticks create two actual zero-duration cardio records without affecting strength or joint counts',()=>{
  let state=fixture();state.entries=[log({id:'joint',date:today,type:'strength',together:true})];state.settings.jointTrainingAnchor={entryId:'joint',number:47};
  state=answerCardio(state,today,1,true,today,today);state=answerCardio(state,today,0,true,today,today);
  assert.equal(cardioWeek(state,today,today).completed,2);assert.ok(cardioWeek(state,today,today).slots.every(s=>s.entry));
  const records=state.entries.filter(e=>e.type==='cardio');assert.equal(records.length,2);assert.ok(records.every(e=>e.date===today&&e.duration===0&&e.durationUnknown&&e.together===false));
  assert.equal(computeTrainingStats(state.entries,state.settings,new Date(2026,10,4)).total,1);assert.equal(jointTrainingHistory(state.entries,state.settings,new Date(2026,10,4)).count,47);
  assert.deepEqual(answerCardio(state,today,0,true,today,today),state);
  assert.equal(answerCardio(state,today,1,false,'',today).entries.length,2);
});

test('manual cardio and cycling automatically fill weekly slots and are never overwritten or duplicated',()=>{
  const state=fixture();state.entries=[log({id:'cycling',date:'2026-11-02',type:'cycling',note:'Existing details'}),log({id:'cardio',date:'2026-11-03',type:'cardio'})];
  assert.equal(cardioWeek(state,today,today).completed,2);assert.deepEqual(answerCardio(state,today,1,true,today,today),state);
  assert.throws(()=>answerCardio(state,today,0,false,'',today),/vlastní zápis/);
  const quick=answerCardio(fixture(),today,0,true,today,today);quick.entries[0].note='Added later';assert.throws(()=>answerCardio(quick,today,0,false,'',today),/vlastní zápis/);
});

test('ticks use a real selected date in the selected week, allow past weeks, and reject future or invalid dates',()=>{
  const state=fixture(),past=answerCardio(state,'2026-10-28',0,true,'2026-10-30',today);
  assert.equal(past.entries[0].date,'2026-10-30');assert.equal(cardioWeek(past,today,today).completed,0);assert.equal(cardioWeek(past,'2026-10-28',today).completed,1);
  for(const date of ['', '2026-10-30','2026-11-05','2026-11-03junk'])assert.throws(()=>answerCardio(state,today,0,true,date,today));
  assert.throws(()=>answerCardio(state,'2026-11-11',0,true,'2026-11-11',today));
  assert.throws(()=>answerCardio(state,today,2,true,today,today));
  assert.equal(cardioWeek(state,today,today).completed,0);
});

test('independent device ticks merge by stable identity, repeat confirmation does not duplicate, and backups retain the target',()=>{
  const base=fixture(),local=answerCardio(base,today,0,true,today,today),remote=answerCardio(base,today,1,true,today,today);
  const merged=mergeDiaries(base,local,remote);assert.equal(cardioWeek(merged,today,today).completed,2);
  assert.equal(mergeDiaries(base,local,answerCardio(base,today,0,true,today,today)).entries.length,1);
  assert.deepEqual(personalSettings(JSON.parse(JSON.stringify(merged.settings))).weeklyCardio,base.settings.weeklyCardio);
  assert.equal(renderCardioRoutine(emptyDiary(),today,'',today),'');
  assert.match(renderCardioRoutine(base,today,'',today),/0 z 2 splněno/);
  for(const target of [0,8,1.5,'2'])assert.throws(()=>personalSettings({weeklyCardio:{...base.settings.weeklyCardio,target}}));
});
