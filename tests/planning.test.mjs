import test from 'node:test';
import assert from 'node:assert/strict';
import { planningSettings, planWeekDates, planWeekSummary, addPlanItem, removePlanItem, togglePlanCheck, renderTodayPlan, renderWeeklyPlan, renderPlanEditor, handlePlanAction } from '../planning.mjs';

const today = '2026-10-30';
const item = (overrides={}) => ({id:'plan-bike', weekday:4, label:'Kolo', type:'cycling', ...overrides});

test('legacy diary settings receive an empty independent personal plan', () => {
  assert.deepEqual(planningSettings({weeklyMinutes:150}, today), {weeklyPlan:[],planChecks:[]});
  assert.deepEqual(addPlanItem({}, item()).weeklyPlan, [item()]);
});

test('plans use valid weekdays, bounded personal labels, activity types, and unique identifiers', () => {
  const value = planningSettings({weeklyPlan:[item({label:'  Bazén  ',type:'cardio',unused:true}), item({id:'plan-work',label:'Práce',type:'other'})]}, today);
  assert.equal(value.weeklyPlan[0].label,'Bazén');
  assert.equal(value.weeklyPlan[0].unused,undefined);
  for (const invalid of [null, item({id:'arbitrary'}), item({weekday:7}), item({weekday:'4'}), item({label:''}), item({label:'x'.repeat(81)}), item({type:'not-an-activity'})]) {
    assert.throws(() => planningSettings({weeklyPlan:[invalid]}, today));
  }
  assert.throws(() => planningSettings({weeklyPlan:[item(),item()]}, today));
  assert.throws(() => planningSettings({weeklyPlan:Array.from({length:41},(_,i)=>item({id:`plan-${i}`}))}, today));
});

test('calendar week is Monday through Sunday across month and year boundaries', () => {
  assert.deepEqual(planWeekDates('2026-11-01'), ['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
  assert.deepEqual(planWeekDates('2027-01-01'), ['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.throws(() => planWeekDates('2026-02-30'));
});

test('checking the plan records no training minutes and can be reversed', () => {
  const settings = {weeklyPlan:[item()],planChecks:[],weeklyMinutes:150};
  const checked = togglePlanCheck(settings,'plan-bike',today,today);
  assert.deepEqual(checked.planChecks,[{id:`${today}:plan-bike`,date:today,planId:'plan-bike'}]);
  assert.equal(checked.entries,undefined);
  assert.equal(settings.planChecks.length,0);
  assert.deepEqual(togglePlanCheck(checked,'plan-bike',today,today).planChecks,[]);
  const summary = planWeekSummary(checked,today);
  assert.equal(summary.completed,1);assert.equal(summary.total,1);
  assert.equal(summary.days[4].items[0].completed,true);
  assert.equal(planWeekSummary(checked,'2026-11-06').completed,0);
});

test('completion cannot be attached to a future day, another weekday or a removed item', () => {
  const settings = {weeklyPlan:[item()]};
  for (const [id,date] of [['plan-bike','2026-11-06'], ['plan-bike','2026-10-29'], ['plan-missing',today], ['plan-bike','2026-02-30']]) {
    assert.throws(() => togglePlanCheck(settings,id,date,today));
  }
  for (const check of [
    {id:'wrong',date:today,planId:'plan-bike'},
    {id:'2026-10-32:plan-bike',date:'2026-10-32',planId:'plan-bike'},
    {id:'2026-11-06:plan-bike',date:'2026-11-06',planId:'plan-bike'},
  ]) assert.throws(() => planningSettings({planChecks:[check]},today));
});

test('removing a recurring item preserves its past checks and other planned items', () => {
  const checked = togglePlanCheck({weeklyPlan:[item(),item({id:'plan-work',type:'other',label:'Práce'})]},'plan-bike',today,today);
  const removed = removePlanItem(checked,'plan-bike');
  assert.equal(removed.planChecks.length,1);
  assert.equal(removed.weeklyPlan.length,1);
  assert.equal(removed.weeklyPlan[0].id,'plan-work');
  assert.equal(planWeekSummary(removed,today).completed,0);
});

test('latest completion can be logged when the rolling history reaches its limit', () => {
  const checks = Array.from({length:2000},(_,i)=>({id:`2020-01-01:plan-${i}`,date:'2020-01-01',planId:`plan-${i}`}));
  const settings = togglePlanCheck({weeklyPlan:[item()],planChecks:checks},'plan-bike',today,today);
  assert.equal(settings.planChecks.length,2000);
  assert.ok(settings.planChecks.some(check=>check.date===today));
});

test('personal text is escaped in cards, labels, buttons and plan editor', () => {
  const settings = {weeklyPlan:[item({label:'<img src=x onerror="alert(1)"> & já'})]};
  for (const html of [renderTodayPlan(settings,today),renderWeeklyPlan(settings,today),renderPlanEditor(settings)]) {
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img'));
    assert.ok(html.includes('&amp; já'));
  }
  assert.ok(renderPlanEditor(settings).includes('Vlastní činnost'));
  assert.ok(renderPlanEditor(settings).includes('Kardio / bazén'));
});

test('opening an activity from a plan does not mutate settings or invent a completed check', async () => {
  const calls=[];
  const handled = await handlePlanAction('plan-log',{dataset:{planId:'plan-bike',planDate:today}},{
    getSettings:()=>({weeklyPlan:[item()]}),
    persist:()=>{throw new Error('Unexpected mutation');},
    openActivity:async(...args)=>calls.push(args),
  });
  assert.equal(handled,true);
  assert.deepEqual(calls,[['cycling',today,'Kolo']]);
  assert.equal(await handlePlanAction('unrelated',{},{}),false);
});
