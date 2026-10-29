/** Framework-free activity journal rules. Dates are local calendar dates. */
export const ACTIVITY_TYPES = Object.freeze([
  { id: 'strength', label: 'Posilovna', icon: 'dumbbell', category: 'movement', color: '#487766', unit: 'min' },
  { id: 'cycling', label: 'Kolo', icon: 'bike', category: 'movement', color: '#90a96b', unit: 'min' },
  { id: 'walking', label: 'Chůze', icon: 'footprints', category: 'movement', color: '#c0a16c', unit: 'min' },
  { id: 'hiking', label: 'Výšlap / turistika', icon: 'mountain', category: 'movement', color: '#638b60', unit: 'min' },
  { id: 'cardio', label: 'Kardio', icon: 'heart', category: 'movement', color: '#bf806b', unit: 'min' },
  { id: 'home', label: 'Domácí trénink', icon: 'home', category: 'movement', color: '#7296a3', unit: 'min' },
  { id: 'sauna', label: 'Sauna', icon: 'flame', category: 'recovery', color: '#d5ac74', unit: 'min' },
  { id: 'wellness', label: 'Wellness', icon: 'sparkles', category: 'recovery', color: '#a7a0ba', unit: 'min' },
  { id: 'recovery', label: 'Regenerace', icon: 'moon', category: 'recovery', color: '#899ca3', unit: 'min' },
  { id: 'steps', label: 'Kroky', icon: 'footprints', category: 'steps', color: '#6388b6', unit: 'kroků' },
  { id: 'moment', label: 'Moment do kroniky', icon: 'image', category: 'chronicle', color: '#ab886d', unit: '' },
]);

export const MODULES = Object.freeze([
  { id: 'movement', label: 'Pohyb', description: 'Tréninky, kolo, chůze, výšlapy a aktivní minuty.' },
  { id: 'recovery', label: 'Regenerace', description: 'Sauna, wellness a prostor pro odpočinek.' },
  { id: 'steps', label: 'Kroky', description: 'Denní kroky a pravidelnost v průběhu týdne.' },
  { id: 'chronicle', label: 'Kronika', description: 'Fotky, poznámky a momenty na tvé cestě.' },
]);

export const DEFAULT_SETTINGS = Object.freeze({
  name: 'Moje tempo',
  modules: Object.freeze(MODULES.map((module) => module.id)),
  weeklyMinutes: 150,
  weeklySessions: 3,
  weeklyRecovery: 2,
  dailySteps: 8000,
});

const typeById = new Map(ACTIVITY_TYPES.map((type) => [type.id, type]));
const weekdays = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];

export function localDate(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) throw new TypeError('Neplatné datum.');
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return null;
  const date = new Date(year, month - 1, day, 12);
  return localDate(date) === value ? date : null;
}

function addDays(date, count) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

function numberOrZero(value) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

function optionalNumber(value, emptyValue = 0) {
  if (value === '' || value === undefined || value === null) return emptyValue;
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Returns errors as Czech messages, and a normalized whitelisted entry. */
export function validateEntry(input, today = localDate()) {
  input = input && typeof input === 'object' ? input : {};
  const errors = [];
  const independent = input.type === 'steps' || input.type === 'moment';
  const duration = optionalNumber(input.duration, independent ? 0 : NaN);
  const steps = optionalNumber(input.steps);
  const distance = optionalNumber(input.distance);
  const elevation = optionalNumber(input.elevation);
  const mood = optionalNumber(input.mood, null);
  const title = String(input.title ?? '').trim();
  const note = String(input.note ?? '').trim();
  const date = String(input.date ?? '');

  if (!typeById.has(input.type)) errors.push('Vyber druh aktivity.');
  if (!parseDate(date)) errors.push('Zadej platné datum.');
  else if (date > today) errors.push('Deník je pro dokončené aktivity. Datum nemůže být v budoucnosti.');
  if (!Number.isInteger(duration) || duration < (independent ? 0 : 1) || duration > 1440) errors.push(independent ? 'Délka zápisu musí být celé číslo od 0 do 1 440 minut.' : 'Délka aktivity musí být 1 až 1 440 celých minut.');
  if (!Number.isInteger(steps) || steps < 0 || steps > 200000) errors.push('Kroky musí být celé číslo od 0 do 200 000.');
  if (!Number.isFinite(distance) || distance < 0 || distance > 2000) errors.push('Vzdálenost musí být od 0 do 2 000 km.');
  if (!Number.isInteger(elevation) || elevation < 0 || elevation > 20000) errors.push('Převýšení musí být celé číslo od 0 do 20 000 metrů.');
  if (input.type === 'steps' && (!Number.isInteger(steps) || steps <= 0)) errors.push('Pro zápis kroků zadej kladný počet kroků.');
  if (mood !== null && (!Number.isInteger(mood) || mood < 1 || mood > 5)) errors.push('Nálada musí být na stupnici 1 až 5.');
  if (title.length > 120) errors.push('Název může mít nejvýše 120 znaků.');
  if (note.length > 3000) errors.push('Poznámka může mít nejvýše 3 000 znaků.');
  if (input.type === 'moment' && !title && !note && !(typeof input.photoId === 'string' && input.photoId.trim())) errors.push('Moment do kroniky potřebuje název, poznámku nebo fotografii.');
  let location;
  if (input.location != null) {
    const place=input.location;
    if (!place || typeof place.name !== 'string' || !place.name.trim() || place.name.length > 200 || typeof place.latitude !== 'number' || !Number.isFinite(place.latitude) || Math.abs(place.latitude)>90 || typeof place.longitude !== 'number' || !Number.isFinite(place.longitude) || Math.abs(place.longitude)>180) errors.push('Místo potřebuje název a platné souřadnice.');
    else location={name:place.name.trim(),latitude:place.latitude,longitude:place.longitude};
  }

  const entry = {
    id: typeof input.id === 'string' && input.id ? input.id : makeId(),
    type: input.type,
    date,
    duration,
    steps,
    distance,
    elevation,
    mood,
    title,
    note,
    createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : new Date().toISOString(),
  };
  if (typeof input.photoId === 'string' && input.photoId) entry.photoId = input.photoId;
  if (location) entry.location = location;
  return { valid: errors.length === 0, errors, entry };
}

/**
 * Stats use the selected date's local Monday–Sunday week and calendar month.
 * Movement minutes and sessions exclude recovery; steps sum all log entries.
 * daysActive counts distinct movement days in that week. typeBreakdown is weekly.
 */
export function computeStats(entries = [], settings = DEFAULT_SETTINGS, date = new Date()) {
  const today = localDate(date);
  const current = parseDate(today);
  const monday = addDays(current, -((current.getDay() + 6) % 7));
  const sunday = localDate(addDays(monday, 6));
  const mondayKey = localDate(monday);
  const validEntries = Array.isArray(entries) ? entries.filter((entry) => entry && typeById.has(entry.type) && parseDate(entry.date)) : [];
  const weekEntries = validEntries.filter((entry) => entry.date >= mondayKey && entry.date <= sunday);
  const movement = weekEntries.filter((entry) => typeById.get(entry.type).category === 'movement');
  const recovery = weekEntries.filter((entry) => typeById.get(entry.type).category === 'recovery');
  const weekMinutes = movement.reduce((total, entry) => total + numberOrZero(entry.duration), 0);
  const weekSteps = weekEntries.reduce((total, entry) => total + numberOrZero(entry.steps), 0);

  function summarizeDay(day) {
    const dayEntries = validEntries.filter((entry) => entry.date === day);
    return {
      date: day,
      minutes: dayEntries.filter((entry) => typeById.get(entry.type).category === 'movement').reduce((total, entry) => total + numberOrZero(entry.duration), 0),
      recoveryMinutes: dayEntries.filter((entry) => typeById.get(entry.type).category === 'recovery').reduce((total, entry) => total + numberOrZero(entry.duration), 0),
      steps: dayEntries.reduce((total, entry) => total + numberOrZero(entry.steps), 0),
      hasActivity: dayEntries.length > 0,
    };
  }

  const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0, 12).getDate();
  const weeklyTarget = Number(settings?.weeklyMinutes) > 0 ? Number(settings.weeklyMinutes) : DEFAULT_SETTINGS.weeklyMinutes;
  return {
    weekMinutes,
    weekSessions: movement.length,
    weekRecovery: recovery.length,
    todaySteps: validEntries.filter((entry) => entry.date === today).reduce((total, entry) => total + numberOrZero(entry.steps), 0),
    weekSteps,
    weekHikes: movement.filter(entry => entry.type === 'hiking').length,
    weekDistance: movement.reduce((total, entry) => total + numberOrZero(entry.distance), 0),
    weekElevation: movement.reduce((total, entry) => total + numberOrZero(entry.elevation), 0),
    weekGoalPercent: Math.round((weekMinutes / weeklyTarget) * 100),
    daysActive: new Set(movement.map((entry) => entry.date)).size,
    weekDaily: Array.from({ length: 7 }, (_, index) => ({ ...summarizeDay(localDate(addDays(monday, index))), label: weekdays[index] })),
    monthDays: Array.from({ length: daysInMonth }, (_, index) => summarizeDay(localDate(new Date(current.getFullYear(), current.getMonth(), index + 1, 12)))),
    typeBreakdown: ACTIVITY_TYPES.map((type) => {
      const matching = weekEntries.filter((entry) => entry.type === type.id);
      return { id: type.id, label: type.label, color: type.color, minutes: matching.reduce((total, entry) => total + numberOrZero(entry.duration), 0), count: matching.length };
    }),
    recentEntries: [...validEntries].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) || String(b.id ?? '').localeCompare(String(a.id ?? ''))),
  };
}

/** Transparent rule-based reflections, not medical or AI-generated advice. */
export function generateInsights(entries = [], settings = DEFAULT_SETTINGS, date = new Date()) {
  const stats = computeStats(entries, settings, date);
  if (!entries.length) return ['Začni jedním zápisem. Přehled se postupně přizpůsobí tomu, co skutečně děláš.'];
  const insights = [];
  if (!stats.weekDaily.some((day) => day.hasActivity)) {
    insights.push('Tento týden zatím nemáš žádný zápis. I krátká procházka nebo chvíle odpočinku se počítá.');
  } else if (settings?.modules?.includes('movement') && stats.weekGoalPercent >= 100) {
    insights.push(`Týdenní cíl pohybu máš splněný na ${stats.weekGoalPercent} %. Dopřej si prostor také pro odpočinek.`);
  } else if (settings?.modules?.includes('movement')) {
    const target = Number(settings?.weeklyMinutes) > 0 ? Number(settings.weeklyMinutes) : DEFAULT_SETTINGS.weeklyMinutes;
    insights.push(`Do tvého cíle zbývá ${Math.max(0, target - stats.weekMinutes)} minut pohybu. Rozděl si je podle svých možností.`);
  } else if (settings?.modules?.includes('steps') && stats.weekSteps > 0) {
    insights.push(`Tento týden máš zaznamenáno ${stats.weekSteps.toLocaleString('cs-CZ')} kroků. Zápisy postupně vytvářejí přehled tvé pravidelnosti.`);
  } else {
    insights.push('I drobné momenty mají v deníku své místo. V kronice se k nim můžeš kdykoliv vrátit.');
  }
  if (stats.weekSessions > 0 && stats.weekRecovery === 0 && settings?.modules?.includes('recovery')) {
    insights.push('Pohyb už v deníku máš, regeneraci zatím ne. Můžeš si poznamenat i lehké protažení nebo odpočinek.');
  } else if (stats.weekRecovery > 0) {
    insights.push(`Tento týden máš ${stats.weekRecovery} ${stats.weekRecovery === 1 ? 'zápis regenerace' : stats.weekRecovery < 5 ? 'zápisy regenerace' : 'zápisů regenerace'}. I odpočinek má v přehledu své místo.`);
  }
  if (stats.daysActive >= 3) insights.push(`Pohyb sis zaznamenal v ${stats.daysActive} dnech tohoto týdne. V přehledu tak vidíš svou pravidelnost.`);
  return insights.slice(0, 3);
}

function csvCell(value) {
  let text = String(value ?? '');
  // Spreadsheet applications may execute formulas even after CSV quote escaping.
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportCSV(entries = []) {
  const rows = [['Datum', 'Aktivita', 'Název', 'Minuty', 'Kroky', 'Nálada', 'Poznámka', 'Vzdálenost (km)', 'Převýšení (m)', 'Místo', 'Zeměpisná šířka', 'Zeměpisná délka']];
  for (const entry of entries) rows.push([entry.date, typeById.get(entry.type)?.label ?? entry.type, entry.title, entry.duration, entry.steps ?? 0, entry.mood ?? '', entry.note, entry.distance ?? 0, entry.elevation ?? 0, entry.location?.name ?? '', entry.location?.latitude ?? '', entry.location?.longitude ?? '']);
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

function icalEscape(value) {
  return String(value ?? '').replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
}

function foldICalLine(line) {
  const lines = [];
  let current = '';
  let length = 0;
  const encoder = new TextEncoder();
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (length + size > 75) {
      lines.push(current);
      current = ' ';
      length = 1;
    }
    current += character;
    length += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}

/** Downloadable all-day calendar events, importable into Google Calendar. */
export function exportICS(entries = []) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moje tempo//Osobni denik//CS', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Moje tempo'];
  for (const entry of entries) {
    const day = parseDate(entry.date);
    if (!day) continue;
    const description = [numberOrZero(entry.duration) > 0 ? `${numberOrZero(entry.duration)} minut` : '', entry.steps ? `${entry.steps} kroků` : '', entry.distance ? `${entry.distance} km` : '', entry.elevation ? `Nastoupáno ${entry.elevation} m` : '', entry.note].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${encodeURIComponent(String(entry.id || `${entry.date}-${entry.type}`))}@mojetempo.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${entry.date.replaceAll('-', '')}`,
      `DTEND;VALUE=DATE:${localDate(addDays(day, 1)).replaceAll('-', '')}`,
      `SUMMARY:${icalEscape(entry.title || typeById.get(entry.type)?.label || 'Aktivita')}`,
      `DESCRIPTION:${icalEscape(description)}`,
      ...(entry.location?[`LOCATION:${icalEscape(entry.location.name)}`,`GEO:${entry.location.latitude};${entry.location.longitude}`]:[]),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldICalLine).join('\r\n')}\r\n`;
}

/** Isolated sample entries. Callers must clearly label demo mode and never merge it into a real diary. */
export function createDemoEntries(date = new Date()) {
  const today = parseDate(localDate(date));
  const samples = [
    { days: 0, type: 'strength', duration: 55, steps: 2400, mood: 4, title: 'Čas pro sebe', note: 'Klidný trénink celého těla. Dobrý pocit po poslední sérii.' },
    { days: 0, type: 'steps', duration: 0, steps: 3200, mood: 4, title: 'Mezi schůzkami', note: 'Další kroky během dne mimo zaznamenaný trénink.' },
    { days: 1, type: 'cycling', duration: 45, steps: 0, mood: 5, title: 'Na chvíli vypnout', note: 'Podvečerní jízda podél řeky. Vlastní tempo, čistá hlava.' },
    { days: 1, type: 'sauna', duration: 25, steps: 0, mood: 5, title: 'Teplo a klid', note: 'Po pohybu chvíle regenerace.' },
    { days: 2, type: 'walking', duration: 35, steps: 6200, distance: 3.8, mood: 4, title: 'Delší cestou domů', note: 'Místo tramvaje procházka parkem.', location:{name:'Stromovka, Praha',latitude:50.105,longitude:14.417} },
    { days: 3, type: 'home', duration: 25, steps: 1800, mood: 3, title: 'I málo je něco', note: 'Krátký domácí trénink mezi pracovními úkoly.' },
    { days: 4, type: 'recovery', duration: 20, steps: 0, mood: 4, title: 'Zpomalit', note: 'Lehké protažení a večer bez spěchu.' },
    { days: 5, type: 'hiking', duration: 120, steps: 12500, distance: 8.5, elevation: 420, mood: 5, title: 'Víkend venku', note: 'Ukázkový výšlap: čerstvý vzduch a nový výhled.', location:{name:'Praděd',latitude:50.083,longitude:17.231} },
    { days: 5, type: 'moment', duration: 0, steps: 0, mood: 5, title: 'Výhled, který zůstal v hlavě', note: 'Ne všechno potřebuje stopky. Někdy si chceš uchovat jen moment.' },
    { days: 6, type: 'strength', duration: 50, steps: 2100, mood: 4, title: 'Další malý krok', note: 'Technika a soustředění.' },
    { days: 8, type: 'cycling', duration: 65, steps: 0, mood: 5, title: 'Za město', note: 'Ukázkový záznam výletu.' },
    { days: 10, type: 'wellness', duration: 60, steps: 0, mood: 5, title: 'Volnější den', note: 'Ukázkový záznam odpočinku.' },
    { days: 12, type: 'cardio', duration: 30, steps: 3800, mood: 4, title: 'Pravidelně po svém', note: 'Ukázkový záznam pohybu.' },
    { days: 15, type: 'walking', duration: 40, steps: 7000, mood: 4, title: 'První zápis', note: 'Ukázková data slouží jen k prohlédnutí přehledu.' },
  ];
  return samples.map(({ days, ...entry }, index) => ({ ...entry, id: `demo-${index}`, date: localDate(addDays(today, -days)), createdAt: addDays(today, -days).toISOString() }));
}
