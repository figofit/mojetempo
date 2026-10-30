import test from 'node:test';
import assert from 'node:assert/strict';
import {EXERCISE_CATALOG,MOVEMENT_PATTERNS,librarySettings,exerciseLibrary,filterExercises,lastExerciseUse} from '../domain.mjs';
import {emptyDiary,mergeDiaries} from '../sync-rules.mjs';

const custom=(id,name='Můj dřep',pattern='squat')=>({id:`custom-${id}`,name,pattern});
const diary=settings=>({...emptyDiary(),settings:{...emptyDiary().settings,...settings}});
const logged=(id,date,rows,other={})=>({id,date,type:'strength',workout:{focus:'fullbody',exercises:rows},...other});

test('catalog assigns exactly one supported primary pattern to each stable ID',()=>{
  assert.ok(EXERCISE_CATALOG.length>=20);
  assert.equal(new Set(EXERCISE_CATALOG.map(row=>row.id)).size,EXERCISE_CATALOG.length);
  for(const row of EXERCISE_CATALOG)assert.ok(MOVEMENT_PATTERNS.some(pattern=>pattern.id===row.pattern));
  assert.deepEqual(librarySettings({name:'Old backup'}),{favoriteExercises:[],customExercises:[]});
  assert.equal(exerciseLibrary({}).length,EXERCISE_CATALOG.length);
});

test('personal exercises and favorites normalize while rejecting malformed references',()=>{
  const input={customExercises:[{...custom('my-squat','  Můj dřep  '),admin:true}],favoriteExercises:['custom-my-squat','bench-press']};
  const result=librarySettings(input);
  assert.deepEqual(result.customExercises,[custom('my-squat')]);
  assert.deepEqual(result.favoriteExercises,input.favoriteExercises);
  assert.equal(exerciseLibrary(input).at(-1).name,'Můj dřep');
  const invalid=[
    {customExercises:[custom('x','')]},
    {customExercises:[custom('x','X','bogus')]},
    {customExercises:[{...custom('x'),id:'bench-press'}]},
    {customExercises:[custom('x'),custom('x')]},
    {customExercises:[custom('x','x'.repeat(101))]},
    {customExercises:Array.from({length:101},(_,i)=>custom(String(i)))},
    {customExercises:null},
    {favoriteExercises:['unknown']},
    {favoriteExercises:['bench-press','bench-press']},
    {favoriteExercises:['custom-missing']},
  ];
  for(const settings of invalid)assert.throws(()=>librarySettings(settings));
});

test('library filters show intended primary pattern groups and favorites',()=>{
  assert.deepEqual(filterExercises(EXERCISE_CATALOG,'favorites',['bench-press']).map(row=>row.id),['bench-press']);
  assert.ok(filterExercises(EXERCISE_CATALOG,'lower').every(row=>['squat','hinge'].includes(row.pattern)));
  assert.ok(filterExercises(EXERCISE_CATALOG,'upper').some(row=>row.id==='pull-up'));
  assert.ok(filterExercises(EXERCISE_CATALOG,'core').some(row=>row.id==='farmer-carry'));
  assert.equal(filterExercises(EXERCISE_CATALOG,'all').length,EXERCISE_CATALOG.length);
  assert.deepEqual(filterExercises(EXERCISE_CATALOG,'unknown'),[]);
});

test('recent working sets match name and pattern, exclude edited/future entries and sum repeated rows',()=>{
  const exercise=EXERCISE_CATALOG.find(row=>row.id==='bench-press');
  const row=(sets,name='Bench press',pattern='horizontal_push')=>({sets,name,pattern});
  const entries=[
    logged('old','2026-10-20',[row(3)]),
    logged('last','2026-10-25',[row(2,'  BENCH   press '),row(2)]),
    logged('wrong-pattern','2026-10-26',[row(20,'Bench press','horizontal_pull')]),
    logged('future','2026-10-30',[row(50)]),
    logged('editing','2026-10-29',[row(5)]),
    logged('invalid-volume','2026-10-28',[row(0)]),
    logged('invalid-date','2026-10-99',[row(20)]),
    logged('wrong-type','2026-10-28',[row(20)],{type:'sauna'}),
  ];
  assert.deepEqual(lastExerciseUse(entries,exercise,{beforeDate:'2026-10-29',excludeEntryId:'editing'}),{date:'2026-10-25',sets:4,entryId:'last'});
  assert.equal(lastExerciseUse(entries,{name:'',pattern:'horizontal_push'},{beforeDate:'2026-10-29'}),null);
  assert.equal(lastExerciseUse(entries,exercise,{beforeDate:'2026-10-01'}),null);
  assert.equal(lastExerciseUse(entries,exercise,{beforeDate:'bad'}),null);
});

test('favorites merge independently with removals on another device',()=>{
  const base=diary({favoriteExercises:['bench-press','pull-up']});
  const local=diary({favoriteExercises:['bench-press','pull-up','goblet-squat']});
  const remote=diary({favoriteExercises:['bench-press','dead-bug']});
  assert.deepEqual(new Set(mergeDiaries(base,local,remote).settings.favoriteExercises),new Set(['bench-press','goblet-squat','dead-bug']));
});

test('personal exercise collections merge per item and reject simultaneous edits',()=>{
  const a=custom('a'),b=custom('b','Přítahy','horizontal_pull');
  const merged=mergeDiaries(diary(),diary({customExercises:[a],favoriteExercises:[a.id]}),diary({customExercises:[b],favoriteExercises:[b.id]}));
  assert.deepEqual(new Set(merged.settings.customExercises.map(row=>row.id)),new Set([a.id,b.id]));
  assert.deepEqual(new Set(merged.settings.favoriteExercises),new Set([a.id,b.id]));
  const base=diary({customExercises:[a]});
  assert.throws(()=>mergeDiaries(base,diary({customExercises:[{...a,name:'Phone edit'}]}),diary({customExercises:[{...a,name:'PC edit'}]})),/dvou zařízeních/);
  assert.throws(()=>mergeDiaries(base,diary(),diary({customExercises:[{...a,name:'PC edit'}]})),/dvou zařízeních/);
});

test('deleting a personal exercise removes its favorite reference without resurrecting it',()=>{
  const a=custom('a');
  const merged=mergeDiaries(diary({customExercises:[a]}),diary(),diary({customExercises:[a],favoriteExercises:[a.id]}));
  assert.deepEqual(merged.settings.customExercises,[]);
  assert.deepEqual(merged.settings.favoriteExercises,[]);
});

test('previous version snapshots gain empty library defaults without losing current preferences',()=>{
  const old=diary();delete old.settings.favoriteExercises;delete old.settings.customExercises;
  const merged=mergeDiaries(old,old,diary({favoriteExercises:['bench-press']}));
  assert.deepEqual(merged.settings.favoriteExercises,['bench-press']);assert.deepEqual(merged.settings.customExercises,[]);
  const fresh=emptyDiary();fresh.settings.favoriteExercises.push('bench-press');
  assert.deepEqual(emptyDiary().settings.favoriteExercises,[]);
});

test('weekly plans and daily checks merge by identity with previous version defaults',()=>{
  const old=diary();delete old.settings.weeklyPlan;delete old.settings.planChecks;
  const planA={id:'plan-a',weekday:0,type:'strength',label:'Posilovna'},planB={id:'plan-b',weekday:2,type:'walking',label:'Venku'};
  const checkA={id:'2026-10-26:plan-a',date:'2026-10-26',planId:'plan-a'},checkB={id:'2026-10-28:plan-b',date:'2026-10-28',planId:'plan-b'};
  const merged=mergeDiaries(old,diary({weeklyPlan:[planA],planChecks:[checkA]}),diary({weeklyPlan:[planB],planChecks:[checkB]}));
  assert.deepEqual(merged.settings.weeklyPlan,[planA,planB]);
  assert.deepEqual(merged.settings.planChecks,[checkA,checkB]);
  const base=diary({weeklyPlan:[planA],planChecks:[checkA]});
  assert.throws(()=>mergeDiaries(base,diary({weeklyPlan:[{...planA,label:'Phone edit'}]}),diary({weeklyPlan:[{...planA,label:'PC edit'}]})),/dvou zařízeních/);
  const deleted=mergeDiaries(base,diary({planChecks:[checkA]}),base);
  assert.deepEqual(deleted.settings.weeklyPlan,[]);
  assert.deepEqual(deleted.settings.planChecks,[checkA]);
});
