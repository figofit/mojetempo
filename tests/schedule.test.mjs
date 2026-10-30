import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleSettings,activeRest,trainingAge,endRest} from '../schedule-rules.mjs';
import {suggestWeeklyRhythm,planWeekSummary,togglePlanCheck,renderWeeklyPlan} from '../planning.mjs';
import {validateEntry,computeStats,exportCSV,exportICS,DEFAULT_SETTINGS} from '../domain.mjs';
import {mergeDiaries,emptyDiary} from '../sync-rules.mjs';
const today='2026-10-30';
const pause={id:'pause-test',start:'2026-10-29',end:'2026-11-02',label:'Volněji'};

test('calendar duration counts completed months across leap years and month ends',()=>{
  assert.deepEqual(trainingAge('2024-02-29','2025-02-28'),{years:1,months:0,days:0,totalMonths:12,totalDays:365});
  assert.deepEqual(trainingAge('2026-01-31','2026-02-28'),{years:0,months:1,days:0,totalMonths:1,totalDays:28});
  assert.equal(trainingAge('2026-01-31','2026-02-27').totalMonths,0);
  assert.equal(trainingAge('2026-03-28','2026-03-30').totalDays,2);
  for(const date of ['', '2026-02-30','2027-01-01'])assert.equal(trainingAge(date,today),null);
});

test('rest periods validate dates and overlaps and include both boundary days',()=>{
  const settings=scheduleSettings({trainingSince:'2016-10-23',restPeriods:[pause]},today);
  assert.equal(activeRest(settings,'2026-10-28'),null);
  assert.equal(activeRest(settings,pause.start).id,pause.id);
  assert.equal(activeRest(settings,pause.end).id,pause.id);
  assert.equal(activeRest(settings,'2026-11-03'),null);
  for(const value of [{trainingSince:'2026-10-31'},{restPeriods:[{...pause,end:'2026-02-30'}]},{restPeriods:[pause,{...pause,id:'pause-overlap',start:pause.end}]},{restPeriods:[{...pause,end:'2028-01-01'}]}])assert.throws(()=>scheduleSettings(value,today));
  const ended=endRest(settings,pause.id,today);
  assert.equal(ended.restPeriods[0].end,'2026-10-29');assert.equal(activeRest(ended,today),null);
  assert.deepEqual(endRest({restPeriods:[{...pause,start:today}]},pause.id,today).restPeriods,[]);
});

test('rest pauses plan obligations while preserving completed checks and actual activity totals',()=>{
  const weeklyPlan=[{id:'plan-a',type:'strength',weekday:4,label:'Fitko'},{id:'plan-b',type:'cycling',weekday:1,label:'Kolo'}];
  const settings={...DEFAULT_SETTINGS,weeklyPlan,planChecks:[{id:today+':plan-a',date:today,planId:'plan-a'}],restPeriods:[pause]};
  const summary=planWeekSummary(settings,today);
  assert.equal(summary.total,1);assert.equal(summary.completed,0);assert.equal(summary.paused,1);
  assert.equal(summary.days[4].items[0].completed,true);
  assert.throws(()=>togglePlanCheck(settings,'plan-a',today,today),/pozastavené/);
  const entries=[validateEntry({id:'actual',type:'strength',date:today,duration:45,title:'Fitko'},today).entry];
  assert.deepEqual(computeStats(entries,settings,new Date(today+'T12:00:00')),computeStats(entries,{...settings,restPeriods:[]},new Date(today+'T12:00:00')));
  const html=renderWeeklyPlan({...settings,restPeriods:[{...pause,label:'<img src=x>'}]},today);
  assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
});

test('suggested rhythm honors every requested count and spaces three strength sessions',()=>{
  const plan=suggestWeeklyRhythm({strength:3,cycling:1,cardio:1,hiking:1});
  assert.equal(plan.length,6);assert.equal(new Set(plan.map(item=>item.id)).size,6);
  assert.deepEqual(plan.filter(item=>item.type==='strength').map(item=>item.weekday),[0,2,4]);
  assert.equal(plan.find(item=>item.type==='hiking').weekday,5);
  for(const [type,count] of Object.entries({strength:3,cycling:1,cardio:1,hiking:1}))assert.equal(plan.filter(item=>item.type===type).length,count);
  const busy=suggestWeeklyRhythm({strength:7,hiking:7});
  for(const type of ['strength','hiking'])assert.equal(new Set(busy.filter(item=>item.type===type).map(item=>item.weekday)).size,7);
  for(const input of [{},{strength:8},{cycling:1.5},{strength:7,cycling:7,hiking:1}])assert.throws(()=>suggestWeeklyRhythm(input));
});

test('mobility exercise choices validate independently and survive both readable exports',()=>{
  const input={id:'mobility',date:today,type:'mobility',duration:15,mobilityExercises:['dead-bug','child-pose','custom:Moje kyčle']};
  const checked=validateEntry(input,today);assert.equal(checked.valid,true);
  assert.deepEqual(checked.entry.mobilityExercises,input.mobilityExercises);assert.notEqual(checked.entry.mobilityExercises,input.mobilityExercises);
  for(const choices of [['made-up'],['dead-bug','dead-bug'],['custom:'],['custom: name'],['custom:line\nline']])assert.equal(validateEntry({...input,mobilityExercises:choices},today).valid,false);
  assert.equal(validateEntry({...input,type:'strength'},today).valid,false);
  const csv=exportCSV([checked.entry]),ics=exportICS([checked.entry]).replace(/\r\n /g,'');
  for(const name of ['Mrtvý brouk','Pozice dítěte','Moje kyčle']){assert.ok(csv.includes(name));assert.ok(ics.includes(name));}
});

test('offline schedule changes merge by period and reject incompatible overlapping pauses',()=>{
  const base=emptyDiary(),local=structuredClone(base),remote=structuredClone(base);
  local.settings.restPeriods=[pause];remote.settings.trainingSince='2016-10-23';
  remote.settings.restPeriods=[{...pause,id:'pause-later',start:'2026-12-01',end:'2026-12-14'}];
  const merged=mergeDiaries(base,local,remote);assert.equal(merged.settings.restPeriods.length,2);assert.equal(merged.settings.trainingSince,'2016-10-23');
  remote.settings.restPeriods=[{...pause,id:'pause-overlap'}];assert.throws(()=>mergeDiaries(base,local,remote));
});
