import test from 'node:test';
import assert from 'node:assert/strict';
import {computeTrainingStats,chronicleGroups} from '../domain.mjs';

const entry=(id,date,type='strength',extra={})=>({id,date,type,duration:0,durationUnknown:true,...extra});

test('strength counts include unknown-duration solo and joint workouts but keep sport walks and recovery separate',()=>{
  const records=[entry('joint','2026-11-04','strength',{together:true}),entry('home','2026-11-03','home'),entry('solo','2026-11-02'),...['cycling','cardio','walking','hiking','mobility','steps','day','moment'].map(type=>entry(type,'2026-11-04',type,{together:true})),entry('future','2026-11-05'),entry('invalid','2026-02-30')];
  const before=structuredClone(records),result=computeTrainingStats(records,{trainingSince:'2026-10-22'},new Date(2026,10,4,12));
  assert.equal(result.total,3);assert.equal(result.together,1);
  assert.ok(result.periods.every(period=>period.count===3&&period.together===1&&period.days===14&&period.weeklyAverage===1.5));
  assert.deepEqual(records,before);
});

test('calendar month half-year and year windows have independent counts and include both boundaries through DST',()=>{
  const records=[entry('today','2026-11-04'),entry('month-first','2026-10-05','strength',{together:true}),entry('before-month','2026-10-04'),entry('half-first','2026-05-05'),entry('before-half','2026-05-04'),entry('year-first','2025-11-05'),entry('before-year','2025-11-04')];
  const result=computeTrainingStats(records,{trainingSince:'2025-01-01'},new Date(2026,10,4,12));
  assert.equal(result.total,7);
  assert.deepEqual(result.periods.map(p=>[p.months,p.windowStart,p.count,p.days]),[[1,'2026-10-05',2,31],[6,'2026-05-05',4,184],[12,'2025-11-05',6,365]]);
  assert.equal(result.periods[0].weeklyAverage,14/31);
});

test('averages use actual recorded history and leap-year lengths rather than treating untracked time as inactivity',()=>{
  const recent=computeTrainingStats([entry('one','2026-11-01'),entry('two','2026-11-04')],{},new Date(2026,10,4,12));
  assert.ok(recent.periods.every(p=>p.start==='2026-11-01'&&p.days===4&&p.weeklyAverage===null));
  const fortnight=computeTrainingStats([entry('one','2026-10-22'),entry('two','2026-11-04')],{},new Date(2026,10,4,12));
  assert.ok(fortnight.periods.every(p=>p.days===14&&p.weeklyAverage===1));
  assert.ok(computeTrainingStats([],{},new Date(2026,10,4,12)).periods.every(p=>p.weeklyAverage===null));
  const leap=computeTrainingStats([entry('leap','2024-02-29')],{trainingSince:'2020-01-01'},new Date(2024,1,29,12));
  assert.equal(leap.periods[2].windowStart,'2023-03-01');assert.equal(leap.periods[2].days,366);
});

test('only explicit moments and photographs get large chronicle cards, while ordinary training notes stay in the list',()=>{
  const records=[entry('solo','2026-11-04','strength',{note:'A normal workout with a long note'}),entry('joint','2026-11-03','strength',{together:true}),entry('moment','2026-11-02','moment',{note:'A special memory'}),entry('photo','2026-11-01','walking',{photoId:'photo-id'})];
  const result=chronicleGroups(records);
  assert.deepEqual(result.featured.map(e=>e.id),['moment','photo']);assert.deepEqual(result.routine.map(e=>e.id),['solo','joint']);
});
