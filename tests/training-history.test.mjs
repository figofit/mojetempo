import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTrainingHistory} from '../history-model.mjs';
import {historicalTotals,anniversaryInfo,consistencyWeek,consistencySeries,monthlyConsistency} from '../history-stats.mjs';
import {renderHistoryDashboard,renderConsistencyDashboard} from '../history-dashboard.mjs';
import {emptyDiary,mergeDiaries} from '../sync-rules.mjs';
import {personalSettings} from '../personal.mjs';
import {validateEntry,jointTrainingHistory} from '../domain.mjs';
import {answerTraining,advanceRoutineReference} from '../training-routine.mjs';

const today='2026-11-07';
const entry=input=>validateEntry({duration:0,durationUnknown:true,...input},'2027-11-30').entry;
function fixture(){
  const state=emptyDiary();
  state.settings.trainingSince='2026-11-02';
  state.settings.trainingRoutine=[{id:'routine-mon',weekday:0,label:'Gym A',together:false,since:'2026-11-02'},{id:'routine-wed',weekday:2,label:'Coach',together:true,since:'2026-11-02'},{id:'routine-fri',weekday:4,label:'Gym B',together:false,since:'2026-11-02'}];
  state.settings.weeklyCardio={target:2,label:'Cardio',since:'2026-11-02'};
  state.entries=[entry({id:'solo',date:'2026-11-02',type:'strength'}),entry({id:'anchor',date:'2026-11-04',type:'home',together:true})];
  state.settings.jointTrainingAnchor={entryId:'anchor',number:12};
  state.settings.trainingHistory={startDate:'2024-11-09',startCertainty:'probable',through:'2026-11-04',total:12,coach:'Test coach',client:'Test client',source:'Reconstructed annual boundaries; verified overall running total.',years:[{year:2024,count:2},{year:2025,count:6},{year:2026,count:4}],highlights:[{id:'history-test-note',title:'Candidate month',summary:'Not an absolute record',detail:'Only a documented calendar checkpoint.',records:[{date:'2025-04-03',number:5}]}]};
  return state;
}

test('historical metadata validates the complete annual sum and preserves edits without creating diary records',()=>{
  const state=fixture(),before=structuredClone(state.entries),h=normalizeTrainingHistory(state.settings.trainingHistory);
  assert.deepEqual(h.years.map(r=>r.count),[2,6,4]);
  const edited=personalSettings({...state.settings,trainingHistory:{...h,years:[{year:2024,count:3},{year:2025,count:5},{year:2026,count:4}]}});
  assert.equal(edited.trainingHistory.total,12);assert.deepEqual(state.entries,before);
  assert.throws(()=>normalizeTrainingHistory({...h,years:[{year:2024,count:2},{year:2025,count:7},{year:2026,count:4}]}),/Součet/);
  assert.throws(()=>normalizeTrainingHistory({...h,years:h.years.slice(1)}));
  assert.throws(()=>personalSettings({...state.settings,trainingHistory:{...h,total:13,years:[{year:2024,count:3},{year:2025,count:6},{year:2026,count:4}]}}),/pořadím/);
  assert.throws(()=>normalizeTrainingHistory({...h,startDate:'2024-02-30'}));
});

test('annual checkpoints remain aggregate-only and future dated joint sessions append without double-counting old backfills',()=>{
  const state=fixture(),before=historicalTotals(state,today);
  assert.deepEqual(before.series.map(r=>r.cumulative),[2,8,12]);assert.equal(before.total,12);assert.equal(before.newJoint,0);assert.deepEqual(before.peakYears,[2025]);assert.equal(before.series[0].partial,true);assert.equal(before.series[2].partial,true);
  state.entries.push(entry({id:'old-proof',date:'2025-04-03',type:'strength',together:true}));assert.equal(historicalTotals(state,today).total,12);
  state.entries.push(entry({id:'new-joint',date:'2026-11-11',type:'sport',together:true}),entry({id:'new-solo',date:'2026-11-12',type:'strength'}));
  assert.equal(historicalTotals(state,today).total,12);
  const future=historicalTotals(state,'2026-11-12');assert.equal(future.total,13);assert.equal(future.series.at(-1).added,1);assert.equal(future.series.at(-1).cumulative,13);assert.equal(jointTrainingHistory(state.entries,state.settings,new Date(2026,10,12)).count,13);
  assert.equal(state.entries.length,5);
});

test('joint units outside a gym count by explicit coach flag while independent sport and passive recovery do not',()=>{
  const state=fixture();
  state.entries.push(...['tennis','boxing','sport','walking','mobility'].map((type,i)=>entry({id:'with-coach-'+i,type,date:'2026-11-05',together:true})),...['tennis','boxing','strength','hiking','mobility'].map((type,i)=>entry({id:'independent-'+i,type,date:'2026-11-06'})),entry({id:'sauna',type:'sauna',date:'2026-11-06',together:true}),entry({id:'moment',type:'moment',date:'2026-11-06',together:true,note:'Memory'}));
  assert.equal(jointTrainingHistory(state.entries,state.settings,new Date(2026,10,7)).count,17);
  assert.equal(historicalTotals(state,today).total,17);
});

test('the first week stays open until Sunday and unknown Friday or cardio never becomes an automatic completion',()=>{
  const state=fixture(),week=consistencyWeek(state,today,today),series=consistencySeries(state,today),month=monthlyConsistency(state,'2026-11',today);
  assert.equal(week.end,'2026-11-08');assert.equal(week.ongoing,true);assert.equal(week.strength,2);assert.equal(week.joint,1);assert.equal(week.cardio,0);assert.equal(week.goalMet,false);assert.equal(week.percent,40);
  assert.equal(series.weeks.length,1);assert.equal(series.activeWeeks,1);assert.equal(series.goalWeeks,0);
  assert.equal(month.activeDays,2);assert.equal(month.days[0].outside,true);assert.equal(month.days[7].future,true);assert.equal(month.days[5].records.length,0);
  assert.equal(consistencyWeek(state,today,'2026-11-09').ongoing,false);assert.equal(state.entries.length,2);
  const next=consistencySeries(state,'2026-11-09');assert.equal(next.weeks.length,2);assert.equal(next.activeWeeks,1);assert.equal(next.weeks.at(-1).records.length,0);
});

test('an installed app advances the current week after Sunday but retains an explicitly reviewed older week',()=>{
  assert.equal(advanceRoutineReference(new Date('2026-11-07T12:00:00'),'2026-11-08','2026-11-09').getDate(),9);
  const older=new Date('2026-10-26T12:00:00');assert.equal(advanceRoutineReference(older,'2026-11-08','2026-11-09'),older);
});

test('extra walking and mobility are active weeks but cannot replace missing strength or cardio goals',()=>{
  let state=fixture();state.entries.push(entry({id:'walk',type:'walking',date:'2026-11-05'}),entry({id:'mobility',type:'mobility',date:'2026-11-06'}));
  assert.equal(consistencyWeek(state,today,today).extra,2);assert.equal(consistencyWeek(state,today,today).goalMet,false);
  state=answerTraining(state,'routine-fri','2026-11-06','yes',today);state.entries.push(entry({id:'tennis',type:'tennis',date:'2026-11-05'}),entry({id:'box',type:'boxing',date:'2026-11-06'}));
  const complete=consistencyWeek(state,today,today);assert.equal(complete.goalMet,true);assert.equal(complete.cardio,2);assert.equal(complete.percent,100);assert.equal(complete.extra,2);
  assert.equal(jointTrainingHistory(state.entries,state.settings,new Date(2026,10,7)).count,12);
});

test('anniversary labels distinguish the upcoming date and actual completed years',()=>{
  const h=fixture().settings.trainingHistory;
  const upcoming=anniversaryInfo(h,today);assert.equal(upcoming.years,2);assert.equal(upcoming.elapsedYears,1);assert.equal(upcoming.daysUntil,2);assert.equal(upcoming.upcoming,true);
  const reached=anniversaryInfo(h,'2026-11-09');assert.equal(reached.elapsedYears,2);assert.equal(reached.upcoming,false);
});

test('history backup and independent online merges retain metadata separately from actual activities',()=>{
  const base=fixture(),local=structuredClone(base),remote=structuredClone(base);
  local.settings.trainingHistory.years[0].count=3;local.settings.trainingHistory.years[1].count=5;
  remote.entries.push(entry({id:'walk',type:'walking',date:'2026-11-06'}));
  const merged=mergeDiaries(base,local,remote);assert.equal(merged.entries.length,3);assert.equal(merged.settings.trainingHistory.years[0].count,3);assert.deepEqual(personalSettings(JSON.parse(JSON.stringify(merged.settings))).trainingHistory,merged.settings.trainingHistory);
  const html=renderHistoryDashboard(base,today)+renderConsistencyDashboard(base,'2026-11',today);
  assert.match(html,/Roční kontrolní body/);assert.match(html,/pravděpodobné datum/);assert.match(html,/Týden ještě probíhá/);assert.ok(!html.includes('nejdelší série:'));
  const unsafe=structuredClone(base);unsafe.settings.trainingHistory.source='<img src=x onerror=alert(1)>';
  assert.ok(!renderHistoryDashboard(unsafe,today).includes('<img src=x'));
});
