import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEntry,computeStrengthStats,strengthTargets,DEFAULT_SETTINGS,exportCSV,exportICS,workoutLabel} from '../domain.mjs';
import {mergeDiaries,emptyDiary} from '../sync-rules.mjs';
const exercise=(pattern,sets=3,name='')=>({pattern,sets,name});
const log=(overrides={})=>({id:'gym',type:'strength',date:'2026-10-29',duration:45,steps:0,mood:null,title:'Trénink',note:'',...overrides});
const workout=(exercises=[],focus='fullbody',splitName='')=>({focus,splitName,exercises});
const date=new Date(2026,9,29,12);

test('a workout records patterns alone or named exercises and strips unknown properties',()=>{
  const result=validateEntry(log({workout:workout([exercise('squat'),exercise('hinge',4,'  Rumunský tah  '),{...exercise('horizontal_push'),admin:true}])}));
  assert.ok(result.valid);assert.equal(result.entry.workout.exercises[1].name,'Rumunský tah');assert.equal(result.entry.workout.exercises[2].admin,undefined);
  assert.equal(result.entry.workout.focus,'fullbody');
  assert.ok(validateEntry(log({type:'home',workout:workout([exercise('core')])})).valid);
  assert.ok(!validateEntry(log({type:'walking',workout:workout([exercise('core')])})).valid);
});
test('malformed exercise volume and split names cannot enter local or cloud diaries',()=>{
  for(const exercises of [[null],[exercise('unknown')],[exercise('squat',0)],[exercise('squat',-1)],[exercise('hinge',1.5)],[exercise('hinge',51)],[exercise('core','3')],Array.from({length:51},()=>exercise('core')),[exercise('squat',3,'x'.repeat(101))]])assert.ok(!validateEntry(log({workout:workout(exercises)})).valid);
  assert.ok(!validateEntry(log({workout:workout([],'custom')})).valid);
  assert.ok(!validateEntry(log({workout:workout([],'custom','x'.repeat(81))})).valid);
  assert.ok(validateEntry(log({workout:workout([],'custom','Záda + biceps')})).valid);
  assert.ok(validateEntry(log()).valid);
});
test('volume uses real working sets, with repeated exercises summed by pattern',()=>{
  const stats=computeStrengthStats([log({workout:workout([exercise('squat',3),exercise('hinge',2),exercise('horizontal_push',3),exercise('vertical_push',2),exercise('horizontal_pull',4),exercise('vertical_pull',1),exercise('squat',1),exercise('core',3),exercise('other',2)])})],DEFAULT_SETTINGS,date);
  assert.equal(stats.totalSets,21);assert.equal(stats.groups.push,5);assert.equal(stats.groups.pull,5);assert.equal(stats.groups.squat,4);assert.equal(stats.groups.hinge,2);
  assert.equal(stats.pullPush.value,1);assert.equal(stats.pullPush.status,'within');assert.equal(stats.hingeSquat.status,'low');
  assert.equal(stats.detailedSessions,1);
});
test('focus-only and legacy workouts show missing coverage and never invent sets',()=>{
  const stats=computeStrengthStats([log(),log({id:'split',workout:workout([],'upper')})],DEFAULT_SETTINGS,date);
  assert.equal(stats.sessions,2);assert.equal(stats.detailedSessions,0);assert.equal(stats.unknownSessions,2);assert.equal(stats.totalSets,0);assert.equal(stats.pullPush.status,'empty');assert.equal(stats.pullPush.value,null);
});
test('week and rolling 28 day windows differ and recovery never enters strength ratios',()=>{
  const logs=[log({date:'2026-10-10',workout:workout([exercise('horizontal_pull')])}),log({date:'2026-10-29',workout:workout([exercise('horizontal_push')])}),log({date:'2026-09-30',workout:workout([exercise('horizontal_push',50)])}),log({type:'sauna',duration:20}),log({date:'2026-10-30'}),log({date:'2026-10-99'})];
  const week=computeStrengthStats(logs,DEFAULT_SETTINGS,date),month=computeStrengthStats(logs,DEFAULT_SETTINGS,date,'28days');
  assert.equal(week.start,'2026-10-26');assert.equal(month.start,'2026-10-02');assert.equal(week.sessions,1);assert.equal(month.sessions,2);assert.equal(week.groups.pull,0);assert.equal(month.pullPush.status,'within');
});
test('customizable targets compare each ratio independently and do not divide by zero',()=>{
  const logs=[log({workout:workout([exercise('horizontal_pull',6),exercise('horizontal_push',3),exercise('hinge',3)])})];
  const stats=computeStrengthStats(logs,{strengthPullPerPush:2,strengthHingePerSquat:1},date);
  assert.equal(stats.pullPush.target,2);assert.equal(stats.pullPush.status,'within');assert.equal(stats.hingeSquat.value,null);assert.equal(stats.hingeSquat.status,'high');
  assert.deepEqual(strengthTargets({}),{strengthPullPerPush:1,strengthHingePerSquat:1});
  for(const value of [0,NaN,Infinity,4.5,0.3])assert.throws(()=>strengthTargets({strengthPullPerPush:value}));
});
test('workouts and custom labels survive CSV and calendar exports with injection escaping',()=>{
  const entry=log({workout:workout([exercise('horizontal_pull',4,'Přítahy\nBEGIN:VEVENT')],'custom','=Záda + biceps')});
  assert.equal(workoutLabel(entry.workout),'=Záda + biceps');
  const csv=exportCSV([entry]);assert.ok(csv.includes("'=Záda + biceps"));assert.ok(csv.includes('4 sérií'));
  const ics=exportICS([entry]).replace(/\r\n /g,'');assert.equal(ics.split('\r\n').filter(line=>line==='BEGIN:VEVENT').length,1);assert.ok(ics.includes('Přítahy\\nBEGIN:VEVENT'));
});
test('new strength goals merge safely with backups and remote snapshots from the previous version',()=>{
  const base=emptyDiary();delete base.settings.strengthPullPerPush;delete base.settings.strengthHingePerSquat;
  const local=structuredClone(base),remote=emptyDiary();remote.settings.strengthPullPerPush=1.5;
  const merged=mergeDiaries(base,local,remote);assert.equal(merged.settings.strengthPullPerPush,1.5);assert.equal(merged.settings.strengthHingePerSquat,1);
});
