/* Calculations use calendar dates in Prague, never elapsed-time guesses. */
const FitCore = (() => {
  const categories = { strength: 'Síla', mobility: 'Mobilita', cardio: 'Kondice', walk: 'Chůze / výlet', other: 'Jiný pohyb' };
  function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  function date(s) { return new Date(`${s}T12:00:00Z`); }
  function shift(s, n) { const d = date(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function week(s) { const d = date(s); return shift(s, -((d.getUTCDay() + 6) % 7)); }
  function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(date(s).getTime()) && date(s).toISOString().slice(0, 10) === s; }
  function format(s, short = false) { return validDate(s) ? new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', day: 'numeric', month: short ? 'short' : 'long', ...(!short ? { year: 'numeric' } : {}) }).format(date(s)) : 'Zatím nenastaveno'; }
  function effectiveStart(d) { return d.profile.startDate || [...d.sessions.map(x => x.date), ...d.days.map(x => x.date)].sort()[0] || ''; }
  function stats(d, from = '', to = today()) {
    const sessions = d.sessions.filter(x => x.date >= from && x.date <= to);
    const days = d.days.filter(x => x.date >= from && x.date <= to);
    const active = new Set([...sessions.map(x => x.date), ...days.filter(x => x.habits.length || (x.steps ?? 0) > 0).map(x => x.date)]);
    return { sessions: sessions.length, minutes: sessions.reduce((n, x) => n + x.minutes, 0), activeDays: active.size, activeWeeks: new Set([...active].map(week)).size, together: sessions.filter(x => x.together).length, steps: days.reduce((n, x) => n + (x.steps || 0), 0), stepsDays: days.filter(x => x.steps !== null).length };
  }
  function weekSeries(d, count = 12, end = today()) {
    const last = week(end), start = effectiveStart(d);
    return Array.from({ length: count }, (_, i) => {
      const first = shift(last, (i - count + 1) * 7), through = shift(first, 6);
      return { date: first, ...stats(d, first, through < end ? through : end), beforeStart: !start || through < start };
    });
  }
  function habitCount(d, id, from = '', to = today()) { return d.days.filter(x => x.date >= from && x.date <= to && x.habits.includes(id)).length; }
  function currentStreak(d, id, end = today()) {
    const done = new Set(d.days.filter(x => x.habits.includes(id)).map(x => x.date));
    let cursor = done.has(end) ? end : shift(end, -1), n = 0;
    while (done.has(cursor)) { n++; cursor = shift(cursor, -1); }
    return n;
  }
  function longestStreak(d, id) {
    const dates = d.days.filter(x => x.habits.includes(id)).map(x => x.date).sort();
    let longest = 0, current = 0, prev = '';
    for (const day of dates) { current = prev && shift(prev, 1) === day ? current + 1 : 1; longest = Math.max(longest, current); prev = day; }
    return longest;
  }
  function validate(value) {
    const fail = text => { throw new Error(text); };
    const object = x => x && typeof x === 'object' && !Array.isArray(x);
    const string = (x, limit = 4000) => typeof x === 'string' && x.length <= limit;
    const number = (x, min, max, integer = false) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max && (!integer || Number.isInteger(x));
    const array = (x, limit) => Array.isArray(x) && x.length <= limit;
    if (!object(value) || value.schemaVersion !== 1 || value.clientId !== 'olda-4-0') fail('Tohle není záloha Oldovy appky ve verzi 1.');
    if (!string(value.revision, 100) || !(value.updatedAt === null || (string(value.updatedAt, 40) && !Number.isNaN(Date.parse(value.updatedAt))))) fail('Záloha má neplatné označení verze.');
    const p = value.profile;
    if (!object(p) || !string(p.name, 80) || !p.name.trim() || !string(p.salutation, 80) || !p.salutation.trim() || !validDate(p.birthday) || !number(p.age, 1, 120, true) || !(p.startDate === '' || validDate(p.startDate)) || !string(p.dedication) || !string(p.signature, 160) || !string(p.vaultUrl, 500)) fail('Záloha má neplatný profil.');
    if (p.vaultUrl) { try { if (new URL(p.vaultUrl).protocol !== 'https:') fail('Odkaz na Vault musí začínat https://.'); } catch { fail('Odkaz na Vault není platný.'); } }
    const plan = value.plan;
    if (!object(plan) || !string(plan.title, 160) || !string(plan.focus) || !string(plan.notes) || !array(plan.exercises, 80) || !plan.exercises.every(x => object(x) && string(x.name, 120) && x.name.trim() && string(x.dose, 120) && string(x.note, 1000))) fail('Záloha má neplatný plán.');
    if (!array(value.habits, 24) || !value.habits.every(x => object(x) && string(x.id, 100) && x.id && string(x.name, 100) && x.name.trim() && string(x.note, 500) && number(x.target, 1, 7, true) && typeof x.archived === 'boolean')) fail('Záloha má neplatné návyky.');
    const ids = new Set(value.habits.map(x => x.id));
    if (ids.size !== value.habits.length) fail('Návyky mají duplicitní identifikátor.');
    if (!array(value.sessions, 20000) || !value.sessions.every(x => object(x) && string(x.id, 100) && x.id && validDate(x.date) && string(x.title, 160) && x.title.trim() && Object.hasOwn(categories, x.category) && number(x.minutes, 0, 1440, true) && typeof x.together === 'boolean' && string(x.note) && array(x.exercises, 80) && x.exercises.every(e => object(e) && string(e.name, 120) && e.name.trim() && number(e.sets, 0, 100, true) && number(e.reps, 0, 10000, true) && number(e.weight, 0, 1500)))) fail('Záloha má neplatný trénink.');
    if (new Set(value.sessions.map(x => x.id)).size !== value.sessions.length) fail('Tréninky mají duplicitní identifikátor.');
    if (!array(value.days, 20000) || !value.days.every(x => object(x) && validDate(x.date) && array(x.habits, 24) && x.habits.every(id => ids.has(id)) && new Set(x.habits).size === x.habits.length && (x.steps === null || number(x.steps, 0, 150000, true)) && (x.energy === null || number(x.energy, 1, 5, true)) && string(x.note))) fail('Záloha má neplatný denní zápis.');
    if (new Set(value.days.map(x => x.date)).size !== value.days.length) fail('Záloha obsahuje dva denní zápisy pro stejné datum.');
    if (!array(value.milestones, 2000) || !value.milestones.every(x => object(x) && string(x.id, 100) && x.id && validDate(x.date) && string(x.title, 160) && x.title.trim() && string(x.note))) fail('Záloha má neplatný milník.');
    if (new Set(value.milestones.map(x => x.id)).size !== value.milestones.length) fail('Milníky mají duplicitní identifikátor.');
    return JSON.parse(JSON.stringify(value));
  }
  return { categories, today, date, shift, week, validDate, format, effectiveStart, stats, weekSeries, habitCount, currentStreak, longestStreak, validate };
})();
