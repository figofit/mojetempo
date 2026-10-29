import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_TYPES, DEFAULT_SETTINGS, localDate, validateEntry, computeStats, generateInsights, exportCSV, exportICS, createDemoEntries } from '../domain.mjs';

const sample = (overrides = {}) => ({ id: 'test', type: 'strength', date: '2026-10-29', duration: 50, steps: 0, mood: 4, title: '', note: '', ...overrides });

test('hikes and places persist distances and ascent in statistics and exports',()=>{
  const location={name:'Praděd',latitude:50.083,longitude:17.231};
  const {valid,entry}=validateEntry(sample({type:'hiking',duration:120,distance:'8.5',elevation:'420',location}));
  assert.ok(valid);assert.equal(entry.distance,8.5);assert.equal(entry.elevation,420);assert.deepEqual(entry.location,location);
  const stats=computeStats([entry],DEFAULT_SETTINGS,new Date(2026,9,29,12));
  assert.equal(stats.weekHikes,1);assert.equal(stats.weekDistance,8.5);assert.equal(stats.weekElevation,420);assert.equal(stats.weekMinutes,120);
  assert.match(exportCSV([entry]),/Praděd/);assert.match(exportICS([entry]).replace(/\r\n /g,''),/GEO:50.083;17.231/);
  for(const bad of [{latitude:91,longitude:0},{latitude:'50',longitude:17},{latitude:50,longitude:NaN}])assert.ok(!validateEntry(sample({location:{name:'Místo',...bad}})).valid);
  assert.ok(validateEntry(sample({type:'walking',location})).valid);
  assert.ok(!validateEntry(sample({distance:-1})).valid);assert.ok(!validateEntry(sample({elevation:1.5})).valid);
});

test('localDate uses local calendar components rather than UTC boundaries', () => {
  const input = new Date(2026, 0, 1, 0, 5);
  assert.equal(localDate(input), '2026-01-01');
  assert.throws(() => localDate(new Date(NaN)), /datum/);
});

test('validation rejects malformed and impossible dates, future dates and unsafe numeric values', () => {
  for (const date of ['2026-02-30', '2026-13-01', '2026-00-01', '2026-1-1', 'not-a-date', '2099-01-01']) {
    assert.equal(validateEntry(sample({ date })).valid, false, date);
  }
  for (const duration of [0, -1, 1441, 1.5, 'hello', '', Infinity]) {
    assert.equal(validateEntry(sample({ duration })).valid, false, `duration ${duration}`);
  }
  for (const steps of [-1, 200001, 1.5, NaN]) assert.equal(validateEntry(sample({ steps })).valid, false);
  assert.equal(validateEntry(sample({ type: 'unrecognized' })).valid, false);
  assert.equal(validateEntry(sample({ mood: 6 })).valid, false);
  assert.equal(validateEntry(null).valid, false);
});

test('validation normalizes optional fields, retains photo identifiers and does not mutate the input', () => {
  const input = sample({ duration: '45', steps: '', mood: '', title: '  Procházka  ', note: '  Dobrý den.  ', photoId: 'photo-1' });
  const result = validateEntry(input);
  assert.equal(result.valid, true);
  assert.equal(result.entry.duration, 45);
  assert.equal(result.entry.steps, 0);
  assert.equal(result.entry.mood, null);
  assert.equal(result.entry.title, 'Procházka');
  assert.equal(result.entry.note, 'Dobrý den.');
  assert.equal(result.entry.photoId, 'photo-1');
  assert.equal(input.title, '  Procházka  ');
  assert.equal(validateEntry(sample({ title: 'x'.repeat(121) })).valid, false);
  assert.equal(validateEntry(sample({ note: 'x'.repeat(3001) })).valid, false);
});

test('steps can be logged without a workout but require a positive step count', () => {
  const result = validateEntry(sample({ type: 'steps', duration: '', steps: '3200' }));
  assert.equal(result.valid, true);
  assert.equal(result.entry.duration, 0);
  assert.equal(result.entry.steps, 3200);
  for (const steps of ['', 0, -1, 0.5]) assert.equal(validateEntry(sample({ type: 'steps', duration: '', steps })).valid, false);
});

test('chronicle moments can be recorded with a title, note or photo and no duration', () => {
  assert.equal(validateEntry(sample({ type: 'moment', duration: '', title: 'Výročí' })).valid, true);
  assert.equal(validateEntry(sample({ type: 'moment', duration: '', note: 'Dnešní myšlenka.' })).valid, true);
  assert.equal(validateEntry(sample({ type: 'moment', duration: '', photoId: 'photo-1' })).valid, true);
  assert.equal(validateEntry(sample({ type: 'moment', duration: '', title: '   ', note: '   ' })).valid, false);
});

test('independent steps and moments are visible on their dates but never count as workouts or recovery', () => {
  const entries = [sample({ type: 'steps', steps: 6000, duration: 0 }), sample({ id: 'moment', type: 'moment', duration: 0, title: 'Výročí' })];
  const stats = computeStats(entries, DEFAULT_SETTINGS, new Date(2026, 9, 29, 12));
  assert.equal(stats.weekMinutes, 0);
  assert.equal(stats.weekSessions, 0);
  assert.equal(stats.weekRecovery, 0);
  assert.equal(stats.daysActive, 0);
  assert.equal(stats.weekSteps, 6000);
  assert.equal(stats.todaySteps, 6000);
  assert.equal(stats.monthDays[28].hasActivity, true);
  assert.equal(stats.weekDaily[3].hasActivity, true);
  assert.equal(stats.recentEntries.length, 2);
  const insights = generateInsights(entries, { ...DEFAULT_SETTINGS, modules: ['steps', 'chronicle'] }, new Date(2026, 9, 29, 12));
  assert.ok(insights[0].includes('kroků'));
  assert.ok(insights.every((message) => !message.includes('zatím nemáš žádný zápis')));
});

test('weekly goals distinguish movement from recovery and aggregate distinct active days', () => {
  const entries = [
    sample({ id: 'a', date: '2026-10-26', duration: 45, steps: 2000 }),
    sample({ id: 'b', date: '2026-10-26', type: 'cycling', duration: 30 }),
    sample({ id: 'c', date: '2026-10-29', type: 'walking', duration: 25, steps: 5000 }),
    sample({ id: 'd', date: '2026-10-29', type: 'sauna', duration: 60 }),
    sample({ id: 'e', date: '2026-10-25', duration: 900, steps: 1000 }),
  ];
  const stats = computeStats(entries, { ...DEFAULT_SETTINGS, weeklyMinutes: 200 }, new Date(2026, 9, 29, 12));
  assert.equal(stats.weekMinutes, 100);
  assert.equal(stats.weekSessions, 3);
  assert.equal(stats.weekRecovery, 1);
  assert.equal(stats.weekGoalPercent, 50);
  assert.equal(stats.daysActive, 2);
  assert.equal(stats.todaySteps, 5000);
  assert.equal(stats.weekSteps, 7000);
  assert.equal(stats.weekDaily[0].date, '2026-10-26');
  assert.equal(stats.weekDaily[6].date, '2026-11-01');
  assert.equal(stats.weekDaily[3].recoveryMinutes, 60);
  assert.equal(stats.typeBreakdown.find((type) => type.id === 'sauna').minutes, 60);
  assert.equal(stats.recentEntries.length, 5);
});

test('week calculations work on Sundays and Mondays across month and year boundaries', () => {
  const entries = [sample({ date: '2025-12-29' }), sample({ date: '2026-01-04' }), sample({ date: '2026-01-05' })];
  const sunday = computeStats(entries, DEFAULT_SETTINGS, new Date(2026, 0, 4, 12));
  assert.equal(sunday.weekDaily[0].date, '2025-12-29');
  assert.equal(sunday.weekDaily[6].date, '2026-01-04');
  assert.equal(sunday.weekSessions, 2);
  assert.equal(sunday.monthDays.length, 31);
  const monday = computeStats(entries, DEFAULT_SETTINGS, new Date(2026, 0, 5, 12));
  assert.equal(monday.weekDaily[0].date, '2026-01-05');
  assert.equal(monday.weekSessions, 1);
});

test('month calendar includes leap day and does not include another month', () => {
  const stats = computeStats([sample({ date: '2024-02-29' }), sample({ date: '2024-03-01' })], DEFAULT_SETTINGS, new Date(2024, 1, 29, 12));
  assert.equal(stats.monthDays.length, 29);
  assert.equal(stats.monthDays.at(-1).date, '2024-02-29');
  assert.equal(stats.monthDays.at(-1).hasActivity, true);
});

test('empty stats are finite and goals can exceed one hundred percent without losing actual progress', () => {
  const empty = computeStats([], { weeklyMinutes: 0 }, new Date(2026, 9, 29));
  assert.equal(empty.weekGoalPercent, 0);
  assert.equal(empty.weekDaily.length, 7);
  assert.equal(empty.monthDays.length, 31);
  assert.equal(computeStats([sample({ duration: 300 })], DEFAULT_SETTINGS, new Date(2026, 9, 29)).weekGoalPercent, 200);
});

test('insights reflect recorded facts and do not pretend that an empty journal is active', () => {
  assert.match(generateInsights([], DEFAULT_SETTINGS, new Date(2026, 9, 29))[0], /Začni jedním zápisem/);
  const insights = generateInsights([sample({ duration: 60 })], DEFAULT_SETTINGS, new Date(2026, 9, 29));
  assert.match(insights[0], /90 minut/);
  assert.ok(insights.some((message) => /regeneraci zatím ne/.test(message)));
});

test('CSV preserves Czech text, quotes and newlines while neutralizing spreadsheet formulas', () => {
  const csv = exportCSV([sample({ title: '=HYPERLINK("evil")', note: '  @SUM(1;2)\nDruhý řádek' })]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"'));
  assert.ok(csv.includes('"\'  @SUM(1;2)\nDruhý řádek"'));
  assert.ok(csv.includes('Nálada'));
  assert.ok(csv.endsWith('\r\n'));
});

test('ICS creates stable all-day events and escapes multiline text instead of injecting properties', () => {
  const ics = exportICS([sample({ id: 'a\r\nEND:VEVENT', date: '2026-12-31', title: 'Trénink, sauna; večer', note: 'První řádek\r\nBEGIN:VEVENT\nDalší řádek' })]);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('DTSTART;VALUE=DATE:20261231\r\n'));
  assert.ok(unfolded.includes('DTEND;VALUE=DATE:20270101\r\n'));
  assert.ok(unfolded.includes('SUMMARY:Trénink\\, sauna\\; večer'));
  assert.ok(unfolded.includes('UID:a%0D%0AEND%3AVEVENT@mojetempo.local'));
  assert.ok(unfolded.includes('První řádek\\nBEGIN:VEVENT\\nDalší řádek'));
  assert.equal(ics.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(unfolded.split('\r\n').filter((line) => line === 'BEGIN:VEVENT').length, 1);
  assert.equal(unfolded.split('\r\n').filter((line) => line === 'END:VEVENT').length, 1);
});

test('ICS folds long Czech UTF-8 lines without splitting code points or exceeding 75 octets', () => {
  const ics = exportICS([sample({ note: 'Příliš žluťoučký kůň '.repeat(30) })]);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
  assert.ok(!ics.includes('\uFFFD'));
  assert.ok(ics.includes('\r\n '));
});

test('calendar and CSV exports support independent moments with zero minutes', () => {
  const moment = sample({ type: 'moment', title: 'Výročí', duration: 0, note: 'Další rok na cestě.' });
  const steps = sample({ id: 'steps', type: 'steps', title: '', duration: 0, steps: 5000 });
  const csv = exportCSV([moment, steps]);
  assert.ok(csv.includes('Moment do kroniky'));
  assert.ok(csv.includes('Kroky'));
  const ics = exportICS([moment, steps]).replace(/\r\n /g, '');
  assert.ok(ics.includes('SUMMARY:Výročí'));
  assert.ok(ics.includes('DESCRIPTION:5000 kroků'));
  assert.ok(!ics.includes('0 minut'));
});

test('demo data use unique IDs, known types and no future calendar dates', () => {
  const today = new Date(2026, 9, 29, 12);
  const demo = createDemoEntries(today);
  assert.equal(new Set(demo.map((entry) => entry.id)).size, demo.length);
  assert.ok(demo.every((entry) => entry.id.startsWith('demo-')));
  assert.ok(demo.every((entry) => entry.date <= '2026-10-29'));
  assert.ok(demo.every((entry) => ACTIVITY_TYPES.some((type) => type.id === entry.type)));
  assert.ok(computeStats(demo, DEFAULT_SETTINGS, today).weekMinutes > 0);
});
