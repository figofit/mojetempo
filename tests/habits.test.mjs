import test from 'node:test';
import assert from 'node:assert/strict';
import {habitSettings,toggleHabit,renderTodayHabits} from '../habits.mjs';
import {emptyDiary,mergeDiaries} from '../sync-rules.mjs';
import {ACTIVITY_TYPES,validateEntry,computeStats,computeStrengthStats,DEFAULT_SETTINGS,exportCSV,exportICS} from '../domain.mjs';

test('mobility is a distinct recovery activity and never increases movement or strength volume',()=>{
  assert.equal(ACTIVITY_TYPES.find(type=>type.id==='mobility').category,'recovery');
  const result=validateEntry({type:'mobility',date:'2026-10-30',duration:15,title:'Večerní mobilita'},'2026-10-30');
  assert.equal(result.valid,true);
  const stats=computeStats([result.entry],DEFAULT_SETTINGS,new Date('2026-10-30T12:00:00'));
  assert.equal(stats.weekMinutes,0);assert.equal(stats.weekSessions,0);assert.equal(stats.weekRecovery,1);
  assert.equal(stats.weekDaily.find(day=>day.date==='2026-10-30').recoveryMinutes,15);
  assert.equal(computeStrengthStats([result.entry]).totalSets,0);
  assert.ok(exportCSV([result.entry]).includes('Mobilita / protažení'));
  assert.ok(exportICS([{...result.entry,title:''}]).includes('Mobilita / protažení'));
});

test('optional habits are absent from old diaries and hidden by default',()=>{
  assert.deepEqual(habitSettings({}),{habits:[],habitChecks:[]});
  assert.equal(renderTodayHabits({}),'');
  const diary=emptyDiary();diary.settings.habits.push('vitamins');
  assert.deepEqual(emptyDiary().settings.habits,[]);
});

test('a daily habit can be checked and unchecked without creating exercise entries',()=>{
  const diary=emptyDiary();diary.settings.habits=['vitamins','protein'];
  const next=toggleHabit(diary.settings,'vitamins','2026-10-30','2026-10-30');
  assert.deepEqual(next.habitChecks,[{id:'2026-10-30:vitamins',date:'2026-10-30',habitId:'vitamins'}]);
  assert.deepEqual(diary.entries,[]);
  assert.equal(renderTodayHabits(next,'2026-10-30').includes('1 / 2 dnes'),true);
  assert.deepEqual(toggleHabit(next,'vitamins','2026-10-30','2026-10-30').habitChecks,[]);
  assert.deepEqual(habitSettings({...next,habits:[]},'2026-10-30').habitChecks,next.habitChecks);
});

test('invalid habits and duplicate future or malformed check records are rejected',()=>{
  for(const habits of [['unknown'],['protein','protein'],'vitamins'])assert.throws(()=>habitSettings({habits}));
  const check={id:'2026-10-30:vitamins',date:'2026-10-30',habitId:'vitamins'};
  for(const habitChecks of [[check,check],[{...check,id:'spoof'}],[{...check,date:'2026-02-30'}],[{...check,date:'2026-10-31',id:'2026-10-31:vitamins'}]])assert.throws(()=>habitSettings({habitChecks},'2026-10-30'));
  assert.throws(()=>toggleHabit({habits:[]},'vitamins','2026-10-30','2026-10-30'));
});

test('two devices merge different habit toggles and checks without overwriting history',()=>{
  const base=emptyDiary(),phone=emptyDiary(),pc=emptyDiary();
  phone.settings={...phone.settings,...toggleHabit({...phone.settings,habits:['vitamins']},'vitamins','2026-10-29','2026-10-30')};
  pc.settings={...pc.settings,...toggleHabit({...pc.settings,habits:['protein']},'protein','2026-10-30','2026-10-30')};
  const result=mergeDiaries(base,phone,pc);
  assert.deepEqual(result.settings.habits,['vitamins','protein']);
  assert.equal(result.settings.habitChecks.length,2);
  assert.deepEqual(result.entries,[]);
  const unchanged=structuredClone(result),unchecked=structuredClone(result);
  unchecked.settings={...unchecked.settings,...toggleHabit(unchecked.settings,'vitamins','2026-10-29','2026-10-30')};
  unchanged.settings={...unchanged.settings,...toggleHabit(unchanged.settings,'protein','2026-10-29','2026-10-30')};
  const merged=mergeDiaries(result,unchecked,unchanged);
  assert.equal(merged.settings.habitChecks.length,2);
  assert.ok(!merged.settings.habitChecks.some(check=>check.id==='2026-10-29:vitamins'));
});
