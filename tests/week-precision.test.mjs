import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEntry,computeStats,entryDateRange,exportCSV,exportICS,jointTrainingHistory} from '../domain.mjs';
import {cardioWeek} from '../training-routine.mjs';
import {monthlyConsistency,consistencyWeek} from '../history-stats.mjs';
import {renderConsistencyDashboard} from '../history-dashboard.mjs';
import {emptyDiary,mergeDiaries} from '../sync-rules.mjs';
const today='2026-11-07',week='2026-11-02';
const record=input=>{const r=validateEntry({duration:0,durationUnknown:true,...input},today);assert.equal(r.valid,true,r.errors.join(' '));return r.entry;};
const weekly=(id,type='boxing')=>record({id,type,date:week,datePrecision:'week',together:false,title:type});
function fixture(){
 const state=emptyDiary();state.settings.trainingSince=week;state.settings.weeklyCardio={target:2,label:'Cardio',since:week};state.settings.trainingRoutine=[{id:'routine-mon',weekday:0,label:'Gym',together:false,since:week},{id:'routine-wed',weekday:2,label:'Coach',together:true,since:week},{id:'routine-fri',weekday:4,label:'Gym',together:false,since:week}];
 state.entries=[record({id:'mon',date:week,type:'strength'}),record({id:'wed',date:'2026-11-04',type:'strength',together:true}),record({id:'fri',date:'2026-11-06',type:'strength'}),weekly('box'),weekly('tennis','tennis')];state.settings.jointTrainingAnchor={entryId:'wed',number:12};return state;
}
test('week-only cardio is explicitly normalized as a week, with no fictional activity day or coach flag',()=>{
 const item=weekly('box');assert.equal(item.datePrecision,'week');assert.deepEqual(entryDateRange(item),{start:week,end:'2026-11-08',weekly:true});
 for(const patch of [{date:'2026-11-03'},{together:true},{type:'strength'},{datePrecision:'unknown'}])assert.equal(validateEntry({...item,...patch},today).valid,false);
 assert.deepEqual(validateEntry(JSON.parse(JSON.stringify(item)),today).entry,item);
});
test('weekly confirmations fulfill cardio goals but do not invent daily activity or a calendar date',()=>{
 const state=fixture(),stats=computeStats(state.entries,state.settings,new Date(2026,10,7)),month=monthlyConsistency(state,'2026-11',today),target=consistencyWeek(state,today,today);
 assert.equal(cardioWeek(state,today,today).completed,2);assert.equal(target.strength,3);assert.equal(target.cardio,2);assert.equal(target.percent,100);assert.equal(target.goalMet,true);assert.equal(stats.daysActive,3);
 assert.equal(month.records.length,3);assert.equal(month.weeklyRecords.length,2);assert.equal(month.activeDays,3);assert.equal(month.days[1].records.length,1);
 const onlyWeekly=computeStats(state.entries.slice(3),state.settings,new Date(2026,10,7));assert.equal(onlyWeekly.daysActive,0);assert.ok(onlyWeekly.monthDays.every(day=>!day.hasActivity));
 assert.equal(jointTrainingHistory(state.entries,state.settings,new Date(2026,10,7)).count,12);
 assert.match(renderConsistencyDashboard(state,'2026-11',today),/týdenní potvrzení: 2/);assert.match(renderConsistencyDashboard(state,'2026-11',today),/den doplníme/);
});
test('refining a weekly record preserves its identity and goal counts while assigning exactly the newly supplied day',()=>{
 const state=fixture(),old=state.entries[3],refined=record({...old,date:'2026-11-05',datePrecision:undefined});state.entries=state.entries.map(e=>e.id===old.id?refined:e);
 const month=monthlyConsistency(state,'2026-11',today);assert.equal(state.entries.length,5);assert.equal(month.records.length,4);assert.equal(month.weeklyRecords.length,1);assert.equal(month.days[4].records[0].id,old.id);assert.equal(consistencyWeek(state,today,today).goalMet,true);
});
test('JSON merge retains week precision and exports distinguish known weeks from actual daily calendar events',()=>{
 const base=emptyDiary(),a=structuredClone(base),b=structuredClone(base);a.entries=[weekly('box')];b.entries=[weekly('tennis','tennis')];const merged=mergeDiaries(base,a,b);
 assert.ok(merged.entries.every(e=>e.datePrecision==='week'));assert.equal(exportICS(merged.entries).includes('BEGIN:VEVENT'),false);assert.match(exportCSV(merged.entries),/Týden 2026-11-02 – 2026-11-08/);
});
