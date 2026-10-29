import { ACTIVITY_TYPES, MODULES, DEFAULT_SETTINGS, WORKOUT_FOCUSES, MOVEMENT_PATTERNS, strengthTargets, computeStrengthStats, workoutLabel, localDate, validateEntry, computeStats, generateInsights, exportCSV, exportICS, createDemoEntries } from './domain.mjs';
import { loadState, updateState, savePhoto, getPhoto, deletePhoto, initializeAccount, getAccount, onAccountChange, authenticate, logout, syncCloud, copyLocalToAccount, loadServerVersion } from './storage.mjs';
import { initializePWA, requestInstall, acceptUpdate } from './pwa.mjs';
import { showMap, destroyMap, searchPlaces } from './places.mjs';
import { emptyDiary, same } from './sync-rules.mjs';

const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 014 19.5v-14A2.5 2.5 0 016.5 3z"/><path d="M8 7h8M8 11h6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  chart: '<path d="M4 3v17h17M8 15V9m5 6V5m5 10v-4"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5zm-10 9 10 5 10-5M2 17l10 5 10-5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3z"/><path d="m8 12 3 3 5-6"/>',
  dumbbell: '<path d="m6 7 11 11M4 4l3 3M17 17l3 3M3 8l5-5m8 18 5-5M2 6l4-4m12 20 4-4M7 10l3-3m4 10 3-3"/>',
  bike: '<circle cx="5" cy="16" r="4"/><circle cx="19" cy="16" r="4"/><path d="m5 16 5-9 5 9H5m5-9h6l3 9M8 4h4m3 0h3v3"/>',
  mountain: '<path d="m2 20 7-14 4 7 3-5 6 12H2zM6 12l3 2 2-3"/>',
  footprints: '<ellipse cx="8" cy="8" rx="3" ry="5" transform="rotate(-20 8 8)"/><ellipse cx="16" cy="15" rx="3" ry="5" transform="rotate(20 16 15)"/><path d="m5 17 2 2m9-14 2-2"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 00-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 000-7.8z"/>',
  home: '<path d="m3 10 9-7 9 7v11H3V10zM9 21v-8h6v8"/>',
  flame: '<path d="M12 3s2 6-2 8c-2-3-4-3-4-3s-5 9 1 12c7 4 15-3 10-10 0 0-1 4-3 4 2-6-2-11-2-11z"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3zM21 3v4m-2-2h4"/>',
  moon: '<path d="M21 13a9 9 0 01-10-10 9 9 0 1010 10z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  upload: '<path d="M12 16V3m-4 4 4-4 4 4M4 16v5h16v-5"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.heart}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const $ = selector => document.querySelector(selector);
const number = n => Number(n || 0).toLocaleString('cs-CZ');
const dateText = (date, options = {}) => new Date(`${date}T12:00:00`).toLocaleDateString('cs-CZ', {day:'numeric',month:'long',...options});
const typeById = id => ACTIVITY_TYPES.find(type => type.id === id);
const moduleOn = id => state.settings.modules.includes(id);
const entries = () => demo ? demoEntries : state.entries;
const views = {overview:'Přehled',diary:'Deník aktivit',chronicle:'Moje kronika',stats:'Statistiky',modules:'Moje moduly',settings:'Cíle a nastavení'};
const viewIcons = {overview:'grid',diary:'book',chronicle:'image',stats:'chart',modules:'layers'};
let state = {version:1,entries:[],settings:{...DEFAULT_SETTINGS, modules:[...DEFAULT_SETTINGS.modules]},onboardingComplete:false};
let demo = false;
let demoEntries = [];
let currentView = 'overview';
let activityFilter = 'all';
let toastTimer;
let photoPreviewUrl;
let renderRevision = 0;
let photoUrls = [];
let storageReady = false;
let editingEntryId=null,authMode='login',settingsDirty=false,placeResults=[],placeSearchRevision=0;
let strengthPeriod='week';
const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const syncChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('moje-tempo-updates') : null;

function notify(message, error = false) {
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.textContent = message;
  el.setAttribute('role', error ? 'alert' : 'status');
  el.classList.remove('hidden');
  toastTimer = setTimeout(() => el.classList.add('hidden'), 5500);
}

async function persist(update) {
  if (!storageReady) throw new Error('Úložiště není dostupné. Povol ukládání dat v prohlížeči a obnov stránku.');
  state = await updateState(current => update(current || {version:1,entries:[],settings:{...DEFAULT_SETTINGS,modules:[...DEFAULT_SETTINGS.modules]},onboardingComplete:false}));
  syncChannel?.postMessage('changed');
}

function heading(title, subtitle, actions = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${esc(new Date().toLocaleDateString('cs-CZ',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</p><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions || `<button class="button primary" data-action="add">${icon('plus')}Zapsat aktivitu</button>`}</div></div>`;
}

function ring(progress, caption, large = false) {
  const safe = Math.min(100, Math.max(0, Number(progress) || 0));
  return `<div class="progress-ring ${large?'large':''}" style="--progress:${safe}%" role="img" aria-label="${esc(caption)}: ${Math.round(progress || 0)} procent"><div><strong>${Math.round(progress || 0)}<span>%</span></strong><small>${esc(caption)}</small></div></div>`;
}

function statCard(symbol, label, value, unit, meta, color = '#176b5b') {
  return `<article class="stat-card"><div class="stat-top"><span class="stat-icon" style="color:${color}">${icon(symbol)}</span><span class="stat-label">${label}</span></div><div class="stat-value">${value}<span>${unit}</span></div><div class="stat-meta">${meta}</div></article>`;
}

function weekChart(stats) {
  const recovery = moduleOn('recovery');
  const max = Math.max(60,...stats.weekDaily.map(day => day.minutes + (recovery ? day.recoveryMinutes : 0)));
  return `<div class="panel-header"><div><h2 class="panel-title">Pohyb v průběhu týdne</h2><p class="panel-subtitle">Prostor pro výkon i odpočinek.</p></div><span class="tag">Tento týden</span></div><div class="chart" role="img" aria-label="Denní minuty pohybu${recovery?' a regenerace':''}"><div class="chart-columns">${stats.weekDaily.map(day => `<div class="chart-column"><span class="chart-total">${day.minutes+(recovery?day.recoveryMinutes:0)||'–'}</span><div class="chart-bars">${recovery?`<div class="chart-bar recovery" style="--bar-height:${day.recoveryMinutes/max*100}%" title="Regenerace: ${day.recoveryMinutes} min"></div>`:''}<div class="chart-bar movement" style="--bar-height:${day.minutes/max*100}%" title="Pohyb: ${day.minutes} min"></div></div><span class="chart-label ${day.date===localDate()?'is-today':''}">${esc(day.label)}</span></div>`).join('')}</div></div><div class="chart-legend"><span><i class="legend-dot movement"></i>Pohyb</span>${recovery?'<span><i class="legend-dot recovery"></i>Regenerace</span>':''}<span class="chart-unit">minuty / den</span></div>`;
}

function monthCalendar(stats) {
  const firstDate = new Date(`${stats.monthDays[0].date}T12:00:00`);
  const offset = (firstDate.getDay()+6)%7;
  const totalDays = stats.monthDays.filter(day => day.minutes+(moduleOn('recovery')?day.recoveryMinutes:0)>0||(moduleOn('steps')&&day.steps>0)).length;
  return `<div class="panel-header"><div><h2 class="panel-title">Měsíc v pohybu</h2><p class="panel-subtitle">${esc(new Date().toLocaleDateString('cs-CZ',{month:'long',year:'numeric'}))}</p></div>${icon('calendar')}</div><div class="month-weekdays">${['Po','Út','St','Čt','Pá','So','Ne'].map(day=>`<span>${day}</span>`).join('')}</div><div class="month-grid">${'<span></span>'.repeat(offset)}${stats.monthDays.map((day,index)=>{const amount=day.minutes+(moduleOn('recovery')?day.recoveryMinutes:0);const steps=moduleOn('steps')?day.steps:0;const percent=Math.min(100,Math.max(amount/30*100,steps/state.settings.dailySteps*100));return `<div class="month-day ${amount||steps?'active':''} ${day.date===localDate()?'today':''}" style="--progress:${percent}%" title="${dateText(day.date)}: ${amount} minut${moduleOn('steps')?', '+number(steps)+' kroků':''}"><span class="month-ring"><span class="month-date">${index+1}</span></span></div>`;}).join('')}</div><div class="month-legend"><span><i class="legend-dot movement"></i>${moduleOn('steps')?'30 min nebo cíl kroků':'30 minut'} = kolečko</span><strong>${totalDays} aktivních dní</strong></div>`;
}

function activityRow(entry, removable = false) {
  const type = typeById(entry.type);
  if (!type) return '';
  const amount=entry.type==='steps'?`${number(entry.steps)}<small> kroků</small>`:entry.type==='moment'?'Moment':`${number(entry.duration)}<small> min</small>`;
  const category={movement:'Pohyb',recovery:'Regenerace',steps:'Kroky',chronicle:'Kronika'}[type.category];
  return `<div class="activity-row"><span class="activity-icon" style="color:${type.color}">${icon(type.icon)}</span><div class="activity-main"><strong class="activity-title">${esc(entry.title || type.label)}</strong><span class="activity-subtitle">${esc(type.label)} <span aria-hidden="true">·</span> ${dateText(entry.date,{month:'short'})}${entry.steps&&entry.type!=='steps'&&moduleOn('steps')?` · ${number(entry.steps)} kroků`:''}${entry.distance?` · ${number(entry.distance)} km`:''}${entry.elevation?` · ↑ ${number(entry.elevation)} m`:''}${entry.location?` · ${esc(entry.location.name)}`:''}</span>${entry.workout?renderWorkoutDetails(entry.workout):''}</div><div class="activity-right"><strong class="activity-duration">${amount}</strong><span class="tag">${category}</span></div>${removable?`<button class="icon-button" data-action="edit" data-id="${esc(entry.id)}" aria-label="Upravit aktivitu ${esc(entry.title || type.label)}">✎</button><button class="icon-button" data-action="delete" data-id="${esc(entry.id)}" aria-label="Smazat aktivitu ${esc(entry.title || type.label)}">${icon('trash')}</button>`:''}</div>`;
}

function renderWorkoutDetails(workout) {
  const total=workout.exercises.reduce((sum,exercise)=>sum+exercise.sets,0);
  return `<details class="workout-details"><summary>${esc(workoutLabel(workout))} · ${total} pracovních sérií</summary><ul>${workout.exercises.map(exercise=>`<li><strong>${esc(exercise.name||MOVEMENT_PATTERNS.find(pattern=>pattern.id===exercise.pattern)?.short||'Cvik')}</strong> · ${exercise.sets} sérií${exercise.name?' · '+esc(MOVEMENT_PATTERNS.find(pattern=>pattern.id===exercise.pattern)?.short||''):''}</li>`).join('')}</ul>${!total?'<small>Cviky zatím nejsou vyplněné.</small>':''}</details>`;
}

function visibleEntries() {
  return entries().filter(entry => {
    const type = typeById(entry.type);
    return type && moduleOn(type.category);
  });
}

function empty(message = 'Tvůj příběh začíná prvním zápisem.', button = true) {
  return `<div class="empty-state">${icon('sparkles')}<h3>${message}</h3><p>Procházka, trénink nebo chvíle v sauně. Všechno má svoje místo.</p>${button?'<button class="button secondary" data-action="add">Zapsat první aktivitu</button>':''}</div>`;
}

function renderOverview(stats) {
  const count=stats.weekSessions;
  const insights=generateInsights(visibleEntries(),state.settings);
  const recent=stats.recentEntries.slice(0,4);
  const goal=moduleOn('movement')?{title:'TÝDENNÍ CÍL POHYBU',percent:stats.weekGoalPercent,value:stats.weekMinutes,target:state.settings.weeklyMinutes,unit:'minut'}:moduleOn('recovery')?{title:'TÝDENNÍ CÍL REGENERACE',percent:stats.weekRecovery/state.settings.weeklyRecovery*100,value:stats.weekRecovery,target:state.settings.weeklyRecovery,unit:'návštěv'}:moduleOn('steps')?{title:'DNEŠNÍ CÍL KROKŮ',percent:stats.todaySteps/state.settings.dailySteps*100,value:stats.todaySteps,target:state.settings.dailySteps,unit:'kroků'}:null;
  return `${heading('Každý pohyb se počítá.', 'Přehled tvého úsilí. Vlastním tempem, den za dnem.')}
    <div class="hero-grid"><section class="hero-card"><div class="hero-copy"><span class="hero-kicker">TVOJE CESTA, TVOJE PRAVIDLA</span><h2>Dobře se hýbat.<br>Dobře se cítit.</h2><p>Trénink, kolo i zasloužený odpočinek.<br>Malé momenty, které tvoří velký příběh.</p><button class="button hero-button" data-action="add">Přidat dnešní moment ${icon('arrow')}</button></div><div class="hero-visual" aria-hidden="true"><svg viewBox="0 0 260 230" fill="none"><circle cx="150" cy="108" r="92" stroke="#ffffff" stroke-opacity=".12"/><circle cx="150" cy="108" r="67" stroke="#ffffff" stroke-opacity=".12"/><path d="M32 180C55 100 96 193 119 110S173 153 209 52" stroke="#c5edb3" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="180" r="8" fill="#c5edb3"/><circle cx="119" cy="110" r="8" fill="#c5edb3"/><circle cx="209" cy="52" r="11" fill="#c5edb3"/><circle cx="209" cy="52" r="21" stroke="#c5edb3" stroke-opacity=".4"/><path d="m180 181 7 7 14-15" stroke="#c5edb3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="166" y="159" width="50" height="43" rx="14" stroke="#ffffff" stroke-opacity=".2"/></svg><span class="hero-badge">${icon('sparkles')} Malé kroky. Skutečný posun.</span></div></section>
    <section class="goal-card"><div>${goal?`<span class="eyebrow">${goal.title}</span>${ring(goal.percent,'splněno',true)}<p><strong>${number(goal.value)}</strong> z ${number(goal.target)} ${goal.unit}</p><button class="button ghost small" data-view="settings">Upravit cíl ${icon('arrow')}</button>`:`<span class="eyebrow">TVŮJ OSOBNÍ PROSTOR</span><h2>Moment po momentu.</h2><p>Kronika uchová, co si chceš zapamatovat.</p><button class="button ghost small" data-view="chronicle">Otevřít kroniku ${icon('arrow')}</button>`}</div></section></div>
    <div class="stat-grid">${moduleOn('movement')?statCard('clock','Minuty pohybu',number(stats.weekMinutes),'min',`Tento týden · cíl ${number(state.settings.weeklyMinutes)} min`)+statCard('dumbbell','Pohybové aktivity',number(count),'',`${stats.daysActive} aktivních dní · cíl ${state.settings.weeklySessions} aktivit`):''}${moduleOn('recovery')?statCard('moon','Čas na regeneraci',number(stats.weekRecovery),'×',`Tento týden · cíl ${state.settings.weeklyRecovery} návštěvy`,'#ae835d'):''}${moduleOn('steps')?statCard('footprints','Dnešní kroky',number(stats.todaySteps),'',`Zapsané aktivity · cíl ${number(state.settings.dailySteps)}`,'#6388b6'):''}</div>
    <div class="dashboard-grid"><section class="panel">${weekChart(stats)}</section><section class="panel compact-calendar">${monthCalendar(stats)}</section></div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Poslední aktivity</h2><p class="panel-subtitle">Malé zápisy, které se neztratí.</p></div><button class="button ghost small" data-view="diary">Celý deník ${icon('arrow')}</button></div><div class="activity-list">${recent.length?recent.map(entry=>activityRow(entry)).join(''):empty()}</div></section><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Chvilka pro bilanci</h2><p class="panel-subtitle">Postřehy z tvých záznamů.</p></div>${icon('sparkles')}</div><div class="insights-list">${insights.slice(0,3).map((insight,index)=>`<article class="insight-card"><span class="insight-icon">${icon(['target','moon','heart'][index])}</span><p>${esc(insight)}</p></article>`).join('')}</div><small class="form-hint">Pravidla podle záznamů. Bez hodnocení zdraví nebo AI rozboru.</small></section></div>`;
}

function renderDiary(stats) {
  const filtered=stats.recentEntries.filter(entry=>activityFilter==='all'||entry.type===activityFilter);
  const available=ACTIVITY_TYPES.filter(type=>moduleOn(type.category));
  return `${heading('Deník aktivit', 'Všechno, co děláš pro sebe, na jednom místě.')}<div class="filter-row"><button class="filter-chip ${activityFilter==='all'?'active':''}" data-filter="all">Všechny aktivity</button>${available.map(type=>`<button class="filter-chip ${activityFilter===type.id?'active':''}" data-filter="${type.id}">${icon(type.icon)}${esc(type.label)}</button>`).join('')}</div><section class="panel"><div class="panel-header"><h2 class="panel-title">${filtered.length} ${filtered.length===1?'záznam':'záznamů'}</h2><div class="activity-actions"><button class="button ghost small" data-action="csv">${icon('download')}CSV</button><button class="button ghost small" data-action="ics">${icon('calendar')}Do kalendáře</button></div></div><div class="activity-list">${filtered.length?filtered.map(entry=>activityRow(entry,true)).join(''):empty('Zatím tu není žádný zápis.')}</div></section>`;
}

function renderChronicle(stats) {
  if (!moduleOn('chronicle')) return `${heading('Moje kronika','Vzpomínky na tvoji cestu.','<button class="button secondary" data-view="modules">Zapnout modul</button>')}${empty('Kronika je právě vypnutá.',false)}`;
  return `${heading('Každý moment má svůj příběh.', 'Fotky, myšlenky a malá vítězství. Tvoje osobní kronika.')}<div class="timeline">${stats.recentEntries.length?stats.recentEntries.map(entry=>{const type=typeById(entry.type);return `<article class="timeline-card"><div class="timeline-date">${dateText(entry.date,{year:'numeric'})}</div>${entry.photoId&&!demo?`<img class="timeline-photo" data-photo="${esc(entry.photoId)}" alt="Fotografie k aktivitě ${esc(entry.title||type.label)}" />`:demo?`<div class="photo-empty">${icon(type.icon)}<span>${esc(type.label)}</span><small>Ukázkový moment</small></div>`:''}<div class="timeline-body"><span class="tag">${esc(type.label)} · ${entry.type==='steps'?number(entry.steps)+' kroků':entry.duration?entry.duration+' min':'Osobní moment'}</span><h2>${esc(entry.title||type.label)}</h2><p style="white-space:pre-wrap">${esc(entry.note||'I tenhle moment patří do tvého příběhu.')}</p>${entry.mood?`<span class="form-hint">Pocit po aktivitě: ${['','Náročné','Slabší','Dobré','Skvělé','Výborné'][entry.mood]}</span>`:''}</div></article>`;}).join(''):empty('První moment čeká na tebe.')}</div>`;
}

function renderStats(stats) {
  const all=visibleEntries();
  const totalMinutes=all.reduce((sum,entry)=>sum+Number(entry.duration),0);
  const types=stats.typeBreakdown.filter(type=>type.count>0);
  const max=Math.max(1,...types.map(type=>type.minutes));
  return `${heading('Tvůj pohyb v souvislostech.', 'Trendy vycházejí z toho, co opravdu zaznamenáš.','<button class="button secondary" data-action="csv">'+icon('download')+'Exportovat CSV</button>')}<div class="stat-grid">${statCard('book','Všechny záznamy',number(all.length),'','Za celou dobu deníku')}${statCard('clock','Celkový čas',number(Math.round(totalMinutes/60*10)/10),'h','Pohyb a regenerace dohromady')}${statCard('calendar','Aktivní dny',number(new Set(all.map(entry=>entry.date)).size),'','Za celou dobu deníku')}${statCard('target','Cíl tohoto týdne',number(Math.round(stats.weekGoalPercent)),'%','Jen pohybové aktivity')}</div><div class="dashboard-grid"><section class="panel">${weekChart(stats)}</section><section class="panel">${monthCalendar(stats)}</section></div><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Z čeho se skládá tvůj týden</h2><p class="panel-subtitle">Každý typ pohybu má svoje místo.</p></div></div>${types.length?types.map(type=>`<div class="breakdown-row"><span>${esc(type.label)}</span><div class="progress-track"><div class="progress-fill" style="width:${type.minutes/max*100}%;background:${type.color}"></div></div><strong>${type.minutes} min</strong><small>${type.count}×</small></div>`).join(''):empty('Statistiky porostou s tvými zápisy.',false)}</section><div class="stat-grid">${statCard('mountain','Výšlapy',number(stats.weekHikes),'','Tento týden')}${statCard('footprints','Vzdálenost',number(Math.round(stats.weekDistance*100)/100),'km','Tento týden · všechny pohybové aktivity')}${statCard('mountain','Nastoupáno',number(stats.weekElevation),'m','Tento týden')}</div>${moduleOn('movement')?renderStrength():''}${renderPlaces()}`;
}

function renderModules() {
  const symbols={movement:'dumbbell',recovery:'moon',steps:'footprints',chronicle:'image'};
  return `${heading('Vyber si svoje tempo.', 'Zapni jen to, co ti dává smysl. Ostatní může počkat.','<span class="tag">'+state.settings.modules.length+' aktivní moduly</span>')}<div class="module-grid">${MODULES.map(module=>`<article class="module-card"><div class="panel-header"><span class="stat-icon">${icon(symbols[module.id])}</span><label class="switch"><input class="switch-input" type="checkbox" data-module="${module.id}" ${moduleOn(module.id)?'checked':''} aria-label="Modul ${esc(module.label)}"/><span></span></label></div><h2>${esc(module.label)}</h2><p>${esc(module.description)}</p><span class="tag">${moduleOn(module.id)?'Zapnuto':'Vypnuto'}</span></article>`).join('')}</div><div class="form-notice">${icon('shield')}Vypnutím modulu se tvé záznamy nesmažou. Kdykoliv se k nim můžeš vrátit. Soukromá záloha vždy obsahuje všechny moduly.</div>`;
}

function renderPlaces() {
  const places=visibleEntries().filter(entry=>entry.location);
  return `<section class="panel places-panel"><div class="panel-header"><div><h2 class="panel-title">Moje místa</h2><p class="panel-subtitle">Procházky, okruhy a výlety. ${places.length} zápisů s místem.</p></div><button class="button secondary small" data-action="show-map">${icon('mountain')}Zobrazit mapku</button></div><div id="places-map" class="places-map hidden" role="region" aria-label="Mapa mých míst"></div>${places.length?`<div class="places-list">${places.slice(0,12).map(entry=>`<span>${esc(entry.location.name)} <small>${dateText(entry.date,{month:'short'})}</small></span>`).join('')}</div>`:'<p class="form-hint">Přidej místo u libovolné aktivity. Stačí i procházka kolem domu.</p>'}<small class="form-hint">Body zachycují místa zápisů, nikoliv GPS trasu. Mapové podklady OpenStreetMap se načtou až po otevření mapky.</small></section>`;
}

function renderStrength() {
  const stats=computeStrengthStats(visibleEntries(),state.settings,new Date(),strengthPeriod);
  const max=Math.max(1,...stats.patterns.map(pattern=>pattern.sets));
  const ratioCard=(title,ratio,left,right)=>`<article class="strength-ratio"><h3>${title}</h3><strong>${ratio.status==='empty'?'Zatím bez sérií':`${number(ratio.numerator)} : ${number(ratio.denominator)}`}</strong><p>Cíl ${number(ratio.target)} : 1 · ${left} : ${right}</p><span class="tag">${{empty:'Zapiš cviky nebo vzory',low:`Nižší podíl: ${left}`,high:`Vyšší podíl: ${left}`,within:'V rozmezí zvoleného cíle'}[ratio.status]}</span></article>`;
  return `<section class="panel strength-panel" id="strength-balance"><div class="panel-header"><div><h2 class="panel-title">Vyváženost silového tréninku</h2><p class="panel-subtitle">Pracovní série podle pohybových vzorů.</p></div><div class="filter-row"><button class="filter-chip ${strengthPeriod==='week'?'active':''}" data-strength-period="week">Tento týden</button><button class="filter-chip ${strengthPeriod==='28days'?'active':''}" data-strength-period="28days">28 dní</button></div></div><p class="form-hint">${dateText(stats.start,{month:'short'})} – ${dateText(stats.end,{month:'short'})} · ${stats.totalSets} sérií · Cviky vyplněné u ${stats.detailedSessions} z ${stats.sessions} silových tréninků.${stats.unknownSessions?' Nevyplněné tréninky do poměrů neodhadujeme.':''}</p><div class="strength-ratios">${ratioCard('Tahy a tlaky vršku těla',stats.pullPush,'tahy','tlaky')}${ratioCard('Pohyb přes kyčle a kolena',stats.hingeSquat,'hinge','dřep')}</div><div class="strength-patterns">${stats.patterns.map(pattern=>`<div class="strength-pattern"><span>${esc(pattern.short)}</span><div class="progress-track"><div class="progress-fill" style="width:${pattern.sets/max*100}%"></div></div><strong>${pattern.sets}<small> sérií</small></strong></div>`).join('')}</div>${stats.focuses.length?`<div class="places-list">${stats.focuses.map(focus=>`<span>${esc(focus.label)} <small>${focus.count}×</small></span>`).join('')}</div>`:''}<p class="form-hint">Výchozí poměr 1 : 1 je nastavitelné srovnání, nikoliv univerzální předpis. Rozmezí cíle je ±20 %. Série nerozlišují zátěž, opakování ani techniku a neměří souměrnost těla. Sleduj celý split za delší období.</p><button class="button ghost small" data-view="settings">Upravit cílové poměry ${icon('arrow')}</button></section>`;
}

function renderAccountSettings() {
  const account=getAccount();
  return `<section class="panel account-panel"><div class="panel-header"><div><h2 class="panel-title">${account.user?'Můj účet':'Deník i na dalším zařízení'}</h2><p class="panel-subtitle">${account.user?esc(account.user.login):'Přihlas se stejným účtem na mobilu i počítači.'}</p></div>${icon('shield')}</div>${account.user?`<p>Zápisy, cíle, místa a fotografie se ukládají do tvého účtu. Bez připojení můžeš zapisovat dál; po návratu online se změny odešlou.</p><div class="export-buttons"><button class="button primary" data-action="sync-account">Synchronizovat teď</button><button class="button secondary" data-action="copy-local">Převést místní deník do účtu</button><button class="button ghost" data-action="open-account">Znovu se přihlásit</button><button class="button ghost" data-action="logout-account">Odhlásit se</button></div><details><summary>Řešení souběžných změn</summary><p>Pokud se stejný údaj změnil na dvou zařízeních, nejdříve stáhni celou zálohu. Potom můžeš načíst poslední verzi z účtu.</p><button class="button secondary" data-action="load-server">Načíst verzi z účtu</button></details><p class="form-hint">Účet: deník do 1,5 MB, fotografie do 1 MB za snímek a 40 MB celkem. Offline kopie účtu zůstává v tomto prohlížeči; na sdíleném zařízení po odhlášení vymaž data webu.</p>`:`<p>Místní deník můžeš používat i bez účtu. Pro přenos mezi zařízeními si vytvoř vlastní účet.</p><button class="button primary" data-action="open-account" ${account.available?'':'disabled'}>Přihlásit se / vytvořit účet</button>${account.available?'':'<p class="form-hint">Na této adrese zatím není připojená databáze účtů. Zápisy se ukládají pouze místně.</p>'}`}</section>`;
}

function renderSettings() {
  return `${heading('Cíle, které sedí tobě.', 'Nastav si vlastní měřítko. A postupně ho přizpůsobuj.','<span class="tag">Osobní nastavení</span>')}${renderAccountSettings()}<div class="settings-layout"><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Moje cíle</h2><p class="panel-subtitle">Cíle slouží jako orientace, ne jako hodnocení.</p></div>${icon('target')}</div><form id="settings-form" class="settings-form"><div class="form-grid"><label class="form-field">Pohyb za týden (minuty)<input name="weeklyMinutes" type="number" min="1" max="10080" step="1" required value="${state.settings.weeklyMinutes}"/></label><label class="form-field">Pohybové aktivity za týden<input name="weeklySessions" type="number" min="1" max="100" step="1" required value="${state.settings.weeklySessions}"/></label><label class="form-field">Regenerace za týden (návštěvy)<input name="weeklyRecovery" type="number" min="1" max="100" step="1" required value="${state.settings.weeklyRecovery}"/></label><label class="form-field">Denní cíl kroků<input name="dailySteps" type="number" min="1" max="200000" step="1" required value="${state.settings.dailySteps}"/></label></div><h3>Cílové poměry pracovních sérií</h3><p class="form-hint">Orientační srovnání za celé období. Přizpůsob si ho svému programu nebo doporučení trenéra.</p><div class="form-grid"><label class="form-field">Tahů na 1 sérii tlaků<input name="strengthPullPerPush" type="number" min="0.25" max="4" step="0.25" required value="${state.settings.strengthPullPerPush??1}" /></label><label class="form-field">Hinge na 1 sérii dřepů<input name="strengthHingePerSquat" type="number" min="0.25" max="4" step="0.25" required value="${state.settings.strengthHingePerSquat??1}" /></label></div><button type="submit" class="button primary">Uložit cíle</button></form></section><section class="panel"><div class="panel-header"><div><h2 class="panel-title">Tvá data jsou tvoje.</h2><p class="panel-subtitle">${getAccount().user?'Záloha obsahuje i záznamy tvého účtu.':'Záznamy a fotky zůstávají v tomto prohlížeči.'}</p></div>${icon('shield')}</div><p class="settings-copy">Záloha JSON obsahuje všechny záznamy, cíle, moduly i fotografie. Stáhni si ji před změnou zařízení, adresy aplikace nebo smazáním dat prohlížeče.</p><div class="export-buttons"><button class="button secondary" data-action="backup">${icon('download')}Stáhnout celou zálohu</button><button class="button secondary" data-action="import">${icon('upload')}Obnovit ze zálohy</button><button class="button ghost" data-action="ics">${icon('calendar')}Export pro Google Kalendář (.ics)</button></div><p class="form-hint">Kalendář se importuje ručně. Import stejného souboru do kalendáře může vytvořit duplicity.</p></section></div>`;
}

async function hydratePhotos(revision) {
  for (const element of document.querySelectorAll('[data-photo]')) {
    try {
      const blob=await getPhoto(element.dataset.photo);
      if (revision!==renderRevision||!element.isConnected) return;
      if(blob) {const url=URL.createObjectURL(blob);photoUrls.push(url);element.src=url;}
      else {element.replaceWith(document.createTextNode('Fotografie není v tomto prohlížeči dostupná.'));}
    } catch { if(element.isConnected) element.alt='Fotografii se nepodařilo načíst.'; }
  }
}

function render() {
  destroyMap();
  photoUrls.forEach(url=>URL.revokeObjectURL(url));photoUrls=[];
  const revision=++renderRevision;
  const stats=computeStats(visibleEntries(),state.settings);
  $('#main-nav').innerHTML=Object.entries(viewIcons).map(([view,symbol])=>`<a href="#${view}" class="nav-item ${currentView===view?'active':''}" ${currentView===view?'aria-current="page"':''}>${icon(symbol)}<span>${views[view]}</span>${view==='diary'?`<small class="nav-count">${visibleEntries().length}</small>`:''}</a>`).join('');
  $('#settings-nav').innerHTML=icon('settings')+'Cíle a nastavení';
  $('#settings-nav').classList.toggle('active',currentView==='settings');
  $('#demo-toggle').innerHTML=icon('eye')+(demo?'Zpět do mého deníku':'Prohlédnout ukázku');
  $('#privacy-label').innerHTML=icon('shield')+'Jen pro tebe';
  $('#breadcrumb-current').textContent=views[currentView];
  $('#demo-banner').innerHTML=demo?'<div class="demo-banner"><div><strong>Prohlížíš ukázkový deník.</strong> Tyto aktivity jsou pouze ilustrační.</div><button class="button small secondary" data-action="start-own">Začít vlastní deník '+icon('arrow')+'</button></div>':'';
  const renderers={overview:()=>renderOverview(stats),diary:()=>renderDiary(stats),chronicle:()=>renderChronicle(stats),stats:()=>renderStats(stats),modules:renderModules,settings:renderSettings};
  $('#view-content').innerHTML=renderers[currentView]();
  renderAccountStatus();
  document.title=`${views[currentView]} · Moje tempo`;
  hydratePhotos(revision);
}

function navigate(view) {
  currentView=Object.hasOwn(views,view)?view:'overview';
  render();
}

async function startOwn() {
  await persist(current=>({...current,onboardingComplete:true}));
  demo=false;
  render();
}

async function openEntry(id=null) {
  if(demo) await startOwn();
  const available=ACTIVITY_TYPES.filter(type=>moduleOn(type.category));
  if(!available.length) {location.hash='modules';notify('Zapni nejprve alespoň jeden modul.');return;}
  $('#entry-form').reset();
  $('#workout-focus').innerHTML=WORKOUT_FOCUSES.map(focus=>`<option value="${focus.id}">${esc(focus.label)}</option>`).join('');
  $('#workout-exercises').replaceChildren();
  editingEntryId=id;
  placeSearchRevision++;
  $('#place-results').replaceChildren();$('#place-status').textContent='';
  $('#entry-type').innerHTML=available.map(type=>`<option value="${type.id}">${esc(type.label)}</option>`).join('');
  $('#entry-date').value=localDate();$('#entry-date').max=localDate();
  if(id) {
    const entry=state.entries.find(item=>item.id===id);
    if(!entry)throw new Error('Zápis už neexistuje.');
    for(const name of ['type','date','duration','steps','distance','elevation','title','note']) $('#entry-form').elements[name].value=entry[name]??'';
    if(entry.mood)$('#entry-form').elements.mood.value=entry.mood;
    if(entry.location)selectPlace(entry.location);
    if(entry.workout){$('#workout-focus').value=entry.workout.focus;$('#workout-split').value=entry.workout.splitName||'';entry.workout.exercises.forEach(exercise=>addExercise(exercise));}
  }
  $('#entry-heading').textContent=id?'Upravit aktivitu':'Zapsat aktivitu';
  $('#entry-error').textContent='';
  syncEntryFields();
  $('#photo-preview').classList.add('hidden');
  $('#photo-label').textContent='Přidat fotku k tomuhle momentu';
  if(photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  $('#entry-dialog').showModal();
}

function syncEntryFields() {
  const type=$('#entry-type').value;
  const timed=!['steps','moment'].includes(type);
  $('#entry-duration-field').classList.toggle('hidden',!timed);
  $('#entry-form [name="duration"]').required=timed;
  $('#entry-form [name="steps"]').required=type==='steps';
  $('#entry-steps-field').classList.toggle('hidden',!moduleOn('steps')||type==='moment');
  $('#entry-chronicle-fields').classList.toggle('hidden',!moduleOn('chronicle'));
  for(const field of ['distance','elevation'])$('#entry-'+field+'-field').classList.toggle('hidden',!['hiking','walking','cycling','cardio'].includes(type));
  syncWorkoutFields();
}

function syncWorkoutFields() {
  const active=['strength','home'].includes($('#entry-type').value);
  $('#strength-fields').classList.toggle('hidden',!active);$('#strength-fields').disabled=!active;
  const custom=$('#workout-focus').value==='custom';
  $('#workout-split-field').classList.toggle('hidden',!custom);$('#workout-split').required=active&&custom;
}
function addExercise(exercise={pattern:'squat',name:'',sets:3}) {
  if(document.querySelectorAll('.exercise-row').length>=50)throw new Error('Do jednoho tréninku lze zapsat nejvýše 50 cviků.');
  const row=document.createElement('div');row.className='exercise-row';
  row.innerHTML=`<label class="form-field">Pohybový vzor<select class="exercise-pattern" required>${MOVEMENT_PATTERNS.map(pattern=>`<option value="${pattern.id}">${esc(pattern.label)}</option>`).join('')}</select></label><label class="form-field">Cvik <span class="form-hint">nepovinné</span><input class="exercise-name" maxlength="100" placeholder="Např. dřep s činkou" /></label><div class="exercise-sets-row"><label class="form-field">Pracovní série<input class="exercise-sets" type="number" min="1" max="50" step="1" required /></label><button class="icon-button" type="button" data-action="remove-exercise" aria-label="Odebrat cvik">${icon('trash')}</button></div>`;
  row.querySelector('.exercise-pattern').value=exercise.pattern;row.querySelector('.exercise-name').value=exercise.name||'';row.querySelector('.exercise-sets').value=exercise.sets;
  $('#workout-exercises').append(row);
}

function download(content,name,mime) {
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const blobDataUrl = blob => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Fotografii se nepodařilo přečíst.'));reader.readAsDataURL(blob);});

async function backup() {
  if(demo) {notify('Pro zálohu přepni do vlastního deníku.');return;}
  const snapshot=await loadState();
  if(!snapshot) throw new Error('Deník se nepodařilo načíst pro zálohu.');
  if(snapshot.entries.length>10000) throw new Error('Tato verze podporuje zálohu nejvýše 10 000 záznamů.');
  const photos={};
  for(const entry of snapshot.entries) if(entry.photoId) {const blob=await getPhoto(entry.photoId);if(!blob) throw new Error('Jedna fotografie chybí. Úplnou zálohu se nepodařilo vytvořit.');photos[entry.photoId]=await blobDataUrl(blob);}
  const content=JSON.stringify({app:'moje-tempo',version:1,exportedAt:new Date().toISOString(),entries:snapshot.entries,settings:snapshot.settings,photos},null,2);
  if(new Blob([content]).size>MAX_BACKUP_BYTES) throw new Error('Záloha přesahuje limit 64 MB této verze. Soubor nebyl vytvořen; záznamy zůstávají uložené.');
  download(content,`moje-tempo-zaloha-${localDate()}.json`,'application/json');
  notify('Záloha obsahuje záznamy i fotografie.');
}

async function compressPhoto(file) {
  if(!file||file.size===0) return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024) throw new Error('Vyber JPG, PNG nebo WebP do 10 MB.');
  const bitmap=await createImageBitmap(file);
  try {
    if(bitmap.width*bitmap.height>50000000) throw new Error('Fotografie je příliš velká. Použij menší obrázek.');
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Fotografii se nepodařilo uložit.')),'image/jpeg',0.82));
  } finally {bitmap.close();}
}

async function submitEntry(event) {
  event.preventDefault();
  const form=event.currentTarget;
  const values=Object.fromEntries(new FormData(form));
  if(['strength','home'].includes(values.type)) {
    const exercises=[...document.querySelectorAll('.exercise-row')].map(row=>({pattern:row.querySelector('.exercise-pattern').value,name:row.querySelector('.exercise-name').value,sets:Number(row.querySelector('.exercise-sets').value)}));
    const focus=$('#workout-focus').value;
    if(focus!=='unspecified'||exercises.length)values.workout={focus,splitName:$('#workout-split').value,exercises};
  }
  const previous=editingEntryId?state.entries.find(entry=>entry.id===editingEntryId):null;
  if(previous?.photoId)values.photoId=previous.photoId;
  if($('#place-query').value.trim()||$('#place-latitude').value||$('#place-longitude').value) {
    if(!$('#place-latitude').value||!$('#place-longitude').value){$('#entry-error').textContent='Vyber místo z výsledků, použij polohu nebo doplň obě souřadnice. Samotný název do mapy nestačí.';return;}
    values.location={name:$('#place-query').value,latitude:Number($('#place-latitude').value),longitude:Number($('#place-longitude').value)};
  }
  if(['steps','moment'].includes(values.type)) values.duration=0;
  if(values.type==='moment') values.steps=0;
  if(values.photo?.size&&moduleOn('chronicle')) values.photoId='pending';
  const result=validateEntry(values);
  if(!result.valid) {$('#entry-error').textContent=result.errors.join(' ');return;}
  $('#save-entry').disabled=true;
  let photoId;
  try {
    const id=editingEntryId||crypto.randomUUID();
    const photo=moduleOn('chronicle')?await compressPhoto(values.photo):null;
    if(photo) {photoId=crypto.randomUUID();await savePhoto(photoId,photo);}
    const entry={...result.entry,id,createdAt:previous?.createdAt||new Date().toISOString()};
    delete entry.photoId;
    if(photoId) entry.photoId=photoId;
    else if(previous?.photoId)entry.photoId=previous.photoId;
    await persist(current=>{
      if(editingEntryId&&!current.entries.some(item=>item.id===editingEntryId))throw new Error('Zápis byl mezitím smazán.');
      return {...current,entries:editingEntryId?current.entries.map(item=>item.id===id?entry:item):[...current.entries,entry],onboardingComplete:true};
    });
    if(photoId&&previous?.photoId)await deletePhoto(previous.photoId).catch(()=>{});
    $('#entry-dialog').close();render();notify('Uloženo. Další malý krok se počítá.');
  } catch(error) {
    if(photoId) await deletePhoto(photoId).catch(()=>{});
    $('#entry-error').textContent=error.message||'Aktivitu se nepodařilo uložit.';
  } finally {$('#save-entry').disabled=false;}
}

async function removeEntry(id) {
  if(demo) {notify('Ukázková data neměníme. Začni vlastní deník.');return;}
  const entry=state.entries.find(item=>item.id===id);
  if(!entry||!confirm('Smazat tento záznam včetně jeho fotografie?')) return;
  await persist(current=>({...current,entries:current.entries.filter(item=>item.id!==id)}));
  if(entry.photoId) await deletePhoto(entry.photoId).catch(()=>{});
  render();notify('Záznam byl smazán.');
}

function validatedSettings(input) {
  const limits={weeklyMinutes:10080,weeklySessions:100,weeklyRecovery:100,dailySteps:200000};
  const output={...DEFAULT_SETTINGS,modules:[...DEFAULT_SETTINGS.modules]};
  Object.assign(output,strengthTargets(input));
  for(const [key,max] of Object.entries(limits)) {
    const value=Number(input?.[key]);
    if(!Number.isInteger(value)||value<1||value>max) throw new Error('Cíle musí být celá kladná čísla v povoleném rozsahu.');
    output[key]=value;
  }
  if(Array.isArray(input.modules)&&input.modules.every(id=>MODULES.some(module=>module.id===id))) output.modules=[...new Set(input.modules)];
  else throw new Error('Neplatné moduly v záloze.');
  return output;
}

function renderAccountStatus() {
  const account=getAccount();
  $('#account-profile').textContent=account.user?account.user.login:'Osobní deník · v tomto prohlížeči';
  $('#account-status').innerHTML=account.user?`<div class="account-status"><span>${icon('shield')}<strong>${esc(account.status)}</strong></span><button class="button ghost small" data-action="sync-account">Synchronizovat</button></div>`:'';
}
async function refreshDiary() {
  state=(await loadState())||emptyDiary();
  demo=!state.onboardingComplete&&!state.entries.length;
  render();
}
function openAccount() {
  $('#account-form').reset();$('#account-error').textContent='';
  $('#account-form').classList.remove('hidden');$('#recovery-result').classList.add('hidden');
  setAuthMode('login');$('#account-dialog').showModal();
}
function setAuthMode(mode) {
  authMode=mode;
  const title={login:'Přihlásit se',register:'Vytvořit účet',recover:'Nastavit nové heslo'}[mode];
  $('#account-heading').textContent=title;$('#account-submit').textContent=title;
  $('#recovery-field').classList.toggle('hidden',mode!=='recover');
  $('#account-form [name="recoveryCode"]').required=mode==='recover';
  $('#account-form [name="password"]').autocomplete=mode==='login'?'current-password':'new-password';
  $('#auth-help').textContent=mode==='register'?'E-mail slouží jako přihlašovací jméno; ověřovací ani obnovovací zprávy zatím neposíláme. Po registraci si ulož obnovovací klíč.':mode==='recover'?'Zadej e-mail, nové heslo a klíč, který sis uložil při registraci. Ostatní zařízení se odhlásí.':'Na dalším zařízení se přihlas stejným e-mailem a heslem.';
  document.querySelectorAll('[data-auth-mode]').forEach(button=>button.classList.toggle('active',button.dataset.authMode===mode));
}
function selectPlace(place) {
  placeSearchRevision++;
  $('#place-query').value=place.name;$('#place-latitude').value=place.latitude;$('#place-longitude').value=place.longitude;
  $('#place-results').replaceChildren();$('#place-status').textContent=`Místo vybráno: ${place.name}`;
}
async function findPlace() {
  const revision=++placeSearchRevision,query=$('#place-query').value;
  $('#place-status').textContent='Hledám místo…';
  try {
    const results=await searchPlaces(query);
    if(revision!==placeSearchRevision||!$('#entry-dialog').open)return;
    placeResults=results;
    $('#place-results').innerHTML=results.map((place,index)=>`<button type="button" class="place-result" data-place-result="${index}">${esc(place.name)}</button>`).join('');
    $('#place-status').textContent=results.length?'Vyber správné místo z výsledků.':'Místo se nepodařilo najít. Zkus přesnější název nebo souřadnice.';
  }catch(error){if(revision===placeSearchRevision)$('#place-status').textContent=error.message||'Vyhledávání míst není dostupné.';}
}
async function locatePlace() {
  if(!navigator.geolocation)throw new Error('Prohlížeč nepodporuje určení polohy.');
  const revision=++placeSearchRevision;
  $('#place-status').textContent='Čekám na povolení polohy…';
  const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('Polohu se nepodařilo získat. Povol ji v prohlížeči nebo zadej místo ručně.')),{enableHighAccuracy:true,timeout:15000,maximumAge:60000}));
  if(revision!==placeSearchRevision||!$('#entry-dialog').open)return;
  selectPlace({name:$('#place-query').value.trim()||'Moje místo',latitude:position.coords.latitude,longitude:position.coords.longitude});
}

async function importBackup(file) {
  if(!file) return;
  if(file.size>MAX_BACKUP_BYTES) throw new Error('Záloha je příliš velká. Limit je 64 MB.');
  const data=JSON.parse(await file.text());
  if(data.app!=='moje-tempo'||data.version!==1||!Array.isArray(data.entries)||data.entries.length>10000||!data.photos||typeof data.photos!=='object'||Array.isArray(data.photos)) throw new Error('Tento soubor není podporovaná záloha Moje tempo.');
  const settings=validatedSettings(data.settings);
  const imported=[];const photoBlobs=[];
  for(const input of data.entries) {
    const validation=validateEntry(input);
    if(!validation.valid) throw new Error('Záloha obsahuje neplatný záznam: '+validation.errors.join(' '));
    const entry={...validation.entry,id:crypto.randomUUID(),createdAt:typeof input.createdAt==='string'?input.createdAt:new Date().toISOString()};
    delete entry.photoId;
    if(input.photoId) {
      const encoded=data.photos[input.photoId];
      if(typeof encoded!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error('Záloha obsahuje chybějící nebo nepodporovanou fotografii.');
      const [header,base64]=encoded.split(',');
      const decoded=atob(base64);const bytes=Uint8Array.from(decoded,char=>char.charCodeAt(0));
      const raw=new Blob([bytes],{type:header.slice(5,header.indexOf(';'))});
      if(raw.size>10*1024*1024) throw new Error('Fotografie v záloze přesahuje 10 MB.');
      const bitmap=await createImageBitmap(raw);
      const pixels=bitmap.width*bitmap.height;bitmap.close();
      if(pixels>50000000) throw new Error('Fotografie v záloze je příliš velká.');
      const blob=raw;
      const photoId=crypto.randomUUID();entry.photoId=photoId;photoBlobs.push([photoId,blob]);
    }
    imported.push(entry);
  }
  if(!confirm(`Obnovit ${imported.length} záznamů ze zálohy? Současný vlastní deník bude nahrazen. Nejdříve si jej případně zazálohuj.`)) return;
  const saved=[];
  try {
    for(const [id,blob] of photoBlobs) {await savePhoto(id,blob);saved.push(id);}
    let previous=[];
    await persist(current=>{previous=current.entries;return {version:1,entries:imported,settings,onboardingComplete:true};});
    demo=false;
    for(const entry of previous) if(entry.photoId) await deletePhoto(entry.photoId).catch(()=>{});
  } catch(error) {for(const id of saved) await deletePhoto(id).catch(()=>{});throw error;}
  render();notify('Záloha byla obnovena včetně fotografií.');
}

async function action(name,element) {
  if(name==='install-app') await requestInstall();
  if(name==='update-app') acceptUpdate();
  if(name==='add') await openEntry();
  if(name==='edit')await openEntry(element.dataset.id);
  if(name==='add-exercise')addExercise();
  if(name==='remove-exercise')element.closest('.exercise-row').remove();
  if(name==='show-map') {const element=$('#places-map');element.classList.remove('hidden');showMap(element,visibleEntries());}
  if(name==='search-place')await findPlace();
  if(name==='locate-place')await locatePlace();
  if(name==='clear-place'){placeSearchRevision++;for(const id of ['place-query','place-latitude','place-longitude'])$('#'+id).value='';$('#place-results').replaceChildren();$('#place-status').textContent='';}
  if(name==='open-account')openAccount();
  if(name==='close-account')$('#account-dialog').close();
  if(name==='download-recovery')download($('#recovery-code').value,'moje-tempo-obnovovaci-klic.txt','text/plain');
  if(name==='sync-account'){await syncCloud();if(!$('#entry-dialog').open&&!settingsDirty)await refreshDiary();}
  if(name==='logout-account'){if(settingsDirty)throw new Error('Nejdříve ulož rozepsané cíle.');await logout();syncChannel?.postMessage('account-changed');await refreshDiary();}
  if(name==='copy-local'&&confirm('Přidat kopii místního deníku do přihlášeného účtu? Původní deník zůstane na zařízení. Opakovaný převod vytvoří další kopie.')){await copyLocalToAccount();await refreshDiary();}
  if(name==='load-server'&&confirm('Nahradit neodeslané změny na tomto zařízení verzí z účtu? Nejdříve si stáhni celou zálohu.')){await loadServerVersion();await refreshDiary();}
  if(name==='close-entry') $('#entry-dialog').close();
  if(name==='start-own') await startOwn();
  if(name==='toggle-demo') {if(demo) await startOwn();else {demo=true;demoEntries=createDemoEntries();render();}}
  if(name==='delete') await removeEntry(element.dataset.id);
  if(name==='csv') {download(exportCSV(visibleEntries()),`moje-tempo${demo?'-ukazka':''}-${localDate()}.csv`,'text/csv;charset=utf-8');notify('CSV je připravené ke stažení.');}
  if(name==='ics') {download(exportICS(visibleEntries()),`moje-tempo${demo?'-ukazka':''}.ics`,'text/calendar;charset=utf-8');notify('Soubor .ics můžeš importovat v nastavení Google Kalendáře.');}
  if(name==='backup') await backup();
  if(name==='import') {$('#import-file').value='';$('#import-file').click();}
}

document.addEventListener('click',event=>{
  const period=event.target.closest('[data-strength-period]');if(period){strengthPeriod=period.dataset.strengthPeriod;render();return;}
  const mode=event.target.closest('[data-auth-mode]');if(mode){setAuthMode(mode.dataset.authMode);return;}
  const place=event.target.closest('[data-place-result]');if(place){selectPlace(placeResults[Number(place.dataset.placeResult)]);return;}
  const el=event.target.closest('[data-action],[data-view],[data-filter]');
  if(!el) return;
  if(el.dataset.action) action(el.dataset.action,el).catch(error=>notify(error.message||'Akci se nepodařilo dokončit.',true));
  if(el.dataset.view) {location.hash=el.dataset.view;if(currentView===el.dataset.view)render();}
  if(el.dataset.filter) {activityFilter=el.dataset.filter;render();}
});
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.dataset.module) {
    el.disabled=true;
    try {
      const checked=el.checked;
      await persist(current=>{const modules=checked?[...new Set([...current.settings.modules,el.dataset.module])]:current.settings.modules.filter(id=>id!==el.dataset.module);return {...current,settings:{...current.settings,modules}};});activityFilter='all';render();notify(checked?'Modul zapnut.':'Modul vypnut. Záznamy zůstávají uložené.');
    } catch(error) {el.checked=!el.checked;el.disabled=false;notify(error.message,true);}
  }
});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='settings-form') return;
  event.preventDefault();
  try {
    const settings=validatedSettings({...Object.fromEntries(new FormData(event.target)),modules:state.settings.modules});
    await persist(current=>({...current,settings:{...settings,modules:current.settings.modules}}));settingsDirty=false;render();notify('Tvoje cíle jsou uložené.');
  } catch(error) {notify(error.message,true);}
});
$('#entry-form').addEventListener('submit',submitEntry);
$('#entry-type').addEventListener('change',syncEntryFields);
$('#workout-focus').addEventListener('change',syncWorkoutFields);
document.addEventListener('input',event=>{if(event.target.closest('#settings-form'))settingsDirty=true;});
$('#place-query').addEventListener('input',()=>{placeSearchRevision++;$('#place-results').replaceChildren();$('#place-status').textContent='';$('#place-latitude').value='';$('#place-longitude').value='';});
$('#account-form').addEventListener('submit',async event=>{
  event.preventDefault();$('#account-submit').disabled=true;$('#account-error').textContent='';
  try {
    const result=await authenticate(authMode,Object.fromEntries(new FormData(event.currentTarget)));
    $('#account-form').reset();
    settingsDirty=false;
    syncChannel?.postMessage('account-changed');
    await refreshDiary();
    if(result.recoveryCode){$('#recovery-code').value=result.recoveryCode;$('#account-form').classList.add('hidden');$('#recovery-result').classList.remove('hidden');}
    else $('#account-dialog').close();
  }catch(error){$('#account-error').textContent=error.message;}
  finally{$('#account-submit').disabled=false;}
});
$('#import-file').addEventListener('change',event=>importBackup(event.target.files[0]).catch(error=>notify(error.message||'Zálohu se nepodařilo obnovit.',true)));
$('#entry-photo').addEventListener('change',event=>{
  if(photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  const file=event.target.files[0];
  if(!file) {$('#photo-preview').classList.add('hidden');return;}
  if(file.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)) {event.target.value='';$('#photo-preview').classList.add('hidden');$('#entry-error').textContent='Vyber JPG, PNG nebo WebP do 10 MB.';return;}
  photoPreviewUrl=URL.createObjectURL(file);$('#photo-preview').src=photoPreviewUrl;$('#photo-preview').classList.remove('hidden');$('#photo-label').textContent=file.name;$('#entry-error').textContent='';
});
$('#mood-options').innerHTML=['Náročné','Slabší','Dobré','Skvělé','Výborné'].map((label,index)=>`<label class="mood-option"><input type="radio" name="mood" value="${index+1}"/><span>${['◔','◑','◕','●','✦'][index]}</span><small>${label}</small></label>`).join('');

if(syncChannel) syncChannel.onmessage=async(event)=>{
  try {
    if(event.data==='account-changed'){location.reload();return;}
    const saved=await loadState();
    if(saved&&!settingsDirty&&!$('#entry-dialog').open) {state={...saved,settings:validatedSettings(saved.settings)};render();}
  } catch(error) {notify(error.message,true);}
};

try {
  await initializeAccount();
  const saved=await loadState();
  storageReady=true;
  if(saved) {
    const settings=validatedSettings(saved.settings);
    if(!Array.isArray(saved.entries)||saved.entries.some(entry=>!validateEntry(entry).valid||typeof entry.id!=='string')) throw new Error('Uložený deník má neplatný formát. Původní data nebyla přepsána.');
    state={...saved,settings};
  }
  demo=!state.onboardingComplete&&state.entries.length===0;
  demoEntries=createDemoEntries();
  navigate(location.hash.slice(1));
  initializePWA({notify});
  onAccountChange(async account=>{
    renderAccountStatus();
    if(account.status==='Uloženo v účtu'&&!settingsDirty&&!document.querySelector('dialog[open]')) {
      const saved=await loadState();if(saved&&!same(saved,state)){state=saved;render();syncChannel?.postMessage('changed');}
    }
  });
} catch(error) {
  storageReady=false;
  $('#view-content').innerHTML=`<section class="panel" role="alert"><h1>Deník se nepodařilo otevřít.</h1><p>${esc(error.message||'Povol ukládání dat v prohlížeči a obnov stránku.')}</p><p>Původní data jsme nepřepsali. Zkus stejný prohlížeč a stejnou adresu aplikace.</p></section>`;
}
