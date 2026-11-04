import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDiary,mergeDiaries} from '../sync-rules.mjs';
import {personalSettings} from '../personal.mjs';
import {answerTraining,trainingRoutineWeek,renderTrainingRoutine} from '../training-routine.mjs';
import {computeTrainingStats,validateEntry} from '../domain.mjs';

const today='2026-11-06';
function fixture(){const state=emptyDiary();state.settings.trainingRoutine=[{id:'routine-mon',weekday:0,label:'Gym A',together:false,since:'2026-11-02'},{id:'routine-wed',weekday:2,label:'With coach',together:true,since:'2026-11-02'},{id:'routine-fri',weekday:4,label:'Gym B',together:false,since:'2026-11-02'}];return state;}
const log=(input)=>validateEntry({durationUnknown:true,duration:0,...input},today).entry;

test('one positive answer creates exactly one actual strength workout with no fabricated minutes or exercises',()=>{
  const base=fixture(),once=answerTraining(base,'routine-wed','2026-11-04','yes',today),twice=answerTraining(once,'routine-wed','2026-11-04','yes',today);
  assert.equal(base.entries.length,0);assert.equal(twice.entries.length,1);assert.deepEqual(once,twice);
  assert.equal(once.entries[0].together,true);assert.equal(once.entries[0].duration,0);assert.equal(once.entries[0].durationUnknown,true);assert.equal(once.entries[0].workout,undefined);
  assert.equal(computeTrainingStats(once.entries,once.settings,new Date(2026,10,6)).together,1);
  const solo=answerTraining(base,'routine-mon','2026-11-02','yes',today);assert.equal(solo.entries[0].together,false);
});

test('no persists without a diary entry, can be reset or changed to yes, and simple confirmations can be corrected',()=>{
  const no=answerTraining(fixture(),'routine-mon','2026-11-02','no',today);
  assert.equal(no.entries.length,0);assert.equal(trainingRoutineWeek(no,today,today).slots[0].status,'missed');
  const reset=answerTraining(no,'routine-mon','2026-11-02','reset',today);assert.equal(reset.settings.trainingSkips.length,0);
  const yes=answerTraining(no,'routine-mon','2026-11-02','yes',today);assert.equal(yes.entries.length,1);assert.equal(yes.settings.trainingSkips.length,0);
  assert.equal(answerTraining(yes,'routine-mon','2026-11-02','no',today).entries.length,0);
});

test('existing manual strength and home workouts are reused while cardio and another training partner are separate',()=>{
  const base=fixture();base.entries=[log({id:'manual',date:'2026-11-02',type:'home',note:'Real details'}),log({id:'cardio',date:'2026-11-04',type:'cardio'}),log({id:'solo',date:'2026-11-04',type:'strength',together:false})];
  const result=answerTraining(base,'routine-mon','2026-11-02','yes',today);assert.equal(result.entries.length,3);assert.deepEqual(result.entries,base.entries);
  assert.throws(()=>answerTraining(base,'routine-mon','2026-11-02','no',today),/vlastní zápis/);
  const joint=answerTraining(base,'routine-wed','2026-11-04','yes',today);assert.equal(joint.entries.length,4);assert.equal(joint.entries.at(-1).together,true);
});

test('later edits to a quick entry are never erased by a negative answer',()=>{
  const state=answerTraining(fixture(),'routine-mon','2026-11-02','yes',today);state.entries[0].note='Added later';
  assert.throws(()=>answerTraining(state,'routine-mon','2026-11-02','no',today),/vlastní zápis/);
  assert.equal(state.entries[0].note,'Added later');
});

test('ordinals include all actual strength workouts and recalculate after backdating but exclude cardio and skips',()=>{
  let state=answerTraining(fixture(),'routine-wed','2026-11-04','yes',today);
  state.entries.push(log({id:'cardio',type:'cycling',date:'2026-11-03'}),log({id:'older',type:'home',date:'2026-10-28'}));
  state=answerTraining(state,'routine-mon','2026-11-02','yes',today);state=answerTraining(state,'routine-fri','2026-11-06','no',today);
  const week=trainingRoutineWeek(state,today,today);
  assert.equal(week.completed,2);assert.equal(week.total,3);assert.deepEqual(week.slots.map(s=>s.ordinal),[2,3,null]);
  assert.match(renderTrainingRoutine(state,today,today),/trénink #3/);
});

test('future, wrong-weekday and pre-start confirmations are rejected and never auto-completed',()=>{
  const state=fixture();assert.equal(trainingRoutineWeek(state,'2026-10-28',today).slots.length,0);
  for(const [id,date] of [['routine-fri','2026-11-13'],['routine-mon','2026-11-03'],['routine-mon','2026-10-26']])assert.throws(()=>answerTraining(state,id,date,'yes',today));
  assert.equal(trainingRoutineWeek(state,'2026-11-04','2026-11-04').slots[2].future,true);
  assert.equal(trainingRoutineWeek(state,today,today).completed,0);
});

test('normalization, export/import and independent offline device answers preserve the routine and decisions',()=>{
  const base=fixture(),local=answerTraining(base,'routine-mon','2026-11-02','yes',today),remote=answerTraining(base,'routine-wed','2026-11-04','no',today);
  const merged=mergeDiaries(base,local,remote),roundtrip=JSON.parse(JSON.stringify(merged));
  assert.deepEqual(personalSettings(roundtrip.settings).trainingRoutine,base.settings.trainingRoutine);
  assert.equal(trainingRoutineWeek(roundtrip,today,today).completed,1);assert.equal(trainingRoutineWeek(roundtrip,today,today).slots[1].status,'missed');
  assert.equal(mergeDiaries(base,local,answerTraining(base,'routine-mon','2026-11-02','yes',today)).entries.length,1);
  const duplicate=fixture();duplicate.settings.trainingRoutine[1].weekday=0;assert.throws(()=>personalSettings(duplicate.settings));
});
