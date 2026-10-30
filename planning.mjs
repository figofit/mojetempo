import { ACTIVITY_TYPES, localDate } from './domain.mjs';
import {activeRest} from './schedule-rules.mjs';

const PLAN_ID = /^plan-[A-Za-z0-9-]{1,80}$/;
const MAX_ITEMS = 40, MAX_CHECKS = 2000;
export const PLAN_DAYS = Object.freeze(['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle']);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
export const PLAN_KINDS=Object.freeze([...ACTIVITY_TYPES,...[{id:'social',label:'Setkání / oběd',color:'#b78eab'},{id:'leisure',label:'Volný čas / kino',color:'#968cb9'},{id:'work',label:'Práce / soustředění',color:'#7b99ae'},{id:'other',label:'Vlastní činnost',color:'#99a08c'}]].map(Object.freeze));
const typeLabel = type => PLAN_KINDS.find(item => item.id === type)?.label || '';
const color = type => PLAN_KINDS.find(item => item.id === type)?.color || '#99a08c';
const loggable=type=>ACTIVITY_TYPES.some(item=>item.id===type);
const rhythmTypes=['strength','cycling','cardio','hiking'];

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && localDate(parsed) === value ? parsed : null;
}

/** Personal recurring plan, separate from the diary of completed activities. */
export function planningSettings(input = {}, today = localDate()) {
  if (!calendarDate(today)) throw new Error('Neplatné dnešní datum.');
  const plan = input.weeklyPlan === undefined ? [] : input.weeklyPlan;
  const checks = input.planChecks === undefined ? [] : input.planChecks;
  if (!Array.isArray(plan) || plan.length > MAX_ITEMS) throw new Error('Týdenní plán může mít nejvýše 40 položek.');
  if (!Array.isArray(checks) || checks.length > MAX_CHECKS) throw new Error('Historie plánu může mít nejvýše 2 000 splnění.');
  const used = new Set();
  const weeklyPlan = plan.map(item => {
    if (!item || typeof item.id !== 'string' || !PLAN_ID.test(item.id) || used.has(item.id) ||
        !Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6 ||
        typeof item.label !== 'string' || !item.label.trim() || item.label.trim().length > 80 ||
        !PLAN_KINDS.some(type => type.id === item.type)) {
      throw new Error('Položka plánu potřebuje platný den, typ a název do 80 znaků.');
    }
    used.add(item.id);
    return {id:item.id, weekday:item.weekday, label:item.label.trim(), type:item.type};
  });
  used.clear();
  const planChecks = checks.map(check => {
    if (!check || typeof check.planId !== 'string' || !PLAN_ID.test(check.planId) ||
        !calendarDate(check.date) || check.date > today || check.id !== `${check.date}:${check.planId}` || used.has(check.id)) {
      throw new Error('Splnění plánu potřebuje platný minulý nebo dnešní den a jedinečnou položku.');
    }
    used.add(check.id);
    // Checks for a removed recurring item remain a valid part of past history.
    return {id:check.id, date:check.date, planId:check.planId};
  });
  return {weeklyPlan, planChecks};
}

export function planWeekDates(date = new Date()) {
  const current = typeof date === 'string' ? calendarDate(date) : calendarDate(localDate(date));
  if (!current) throw new Error('Neplatné datum týdne.');
  current.setDate(current.getDate() - (current.getDay() + 6) % 7);
  return PLAN_DAYS.map((_, index) => {
    const day = new Date(current); day.setDate(current.getDate() + index); return localDate(day);
  });
}

export function planWeekSummary(settings, date = new Date()) {
  const {weeklyPlan, planChecks} = planningSettings(settings);
  const dates = planWeekDates(date), completed = new Set(planChecks.map(check => check.id));
  const days=dates.map((day,weekday)=>({date:day,weekday,rest:activeRest(settings,day),items:weeklyPlan.filter(item=>item.weekday===weekday).map(item=>({...item,date:day,paused:!!activeRest(settings,day),completed:completed.has(`${day}:${item.id}`)}))}));
  const items=days.flatMap(day=>day.items),eligible=items.filter(item=>!item.paused);
  return {days,total:eligible.length,completed:eligible.filter(item=>item.completed).length,paused:items.length-eligible.length};
}

export function addPlanItem(settings, item) {
  return planningSettings({...settings, weeklyPlan:[...(settings.weeklyPlan || []), item]});
}

export function removePlanItem(settings, id) {
  return planningSettings({...settings, weeklyPlan:(settings.weeklyPlan || []).filter(item => item.id !== id)});
}

/** A check is an intentional completion, never a fabricated diary activity. */
export function togglePlanCheck(settings, planId, date, today = localDate()) {
  if(activeRest(settings,date))throw new Error('Plnění plánu je v tento den pozastavené. Skutečnou aktivitu můžeš normálně zapsat.');
  const normalized = planningSettings(settings, today);
  const plan = normalized.weeklyPlan.find(item => item.id === planId), parsed = calendarDate(date);
  if (!plan || !parsed || date > today || (parsed.getDay() + 6) % 7 !== plan.weekday) throw new Error('Tuto položku lze odškrtnout jen v její plánovaný den, nejpozději dnes.');
  const id = `${date}:${planId}`;
  const exists = normalized.planChecks.some(check => check.id === id);
  let planChecks = exists ? normalized.planChecks.filter(check => check.id !== id) : [...normalized.planChecks, {id, date, planId}];
  // Keep the most recent 2 000 checks; the limit never prevents today's entry.
  planChecks = planChecks.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).slice(-MAX_CHECKS);
  return {...normalized, planChecks};
}

function planItemCard(item, today) {
  const future=item.date>today;
  return `<article class="plan-item ${item.completed?'is-complete':''} ${item.paused?'is-paused':''}" style="--plan-color:${color(item.type)}"><button type="button" class="plan-check" data-action="toggle-plan" data-plan-id="${esc(item.id)}" data-plan-date="${item.date}" aria-label="${item.completed?'Zrušit splnění':'Označit jako splněné'}: ${esc(item.label)}" aria-pressed="${item.completed}" ${future||item.paused?'disabled':''}>${item.completed?'✓':'○'}</button><div class="plan-item-copy"><strong>${esc(item.label)}</strong><small>${esc(typeLabel(item.type))} · ${item.paused?'Plnění pozastaveno':item.completed?'Splněno':future?'Naplánováno':'Čeká na tebe'}</small></div>${loggable(item.type)&&!future?`<button type="button" class="button ghost small" data-action="plan-log" data-plan-id="${esc(item.id)}" data-plan-date="${item.date}" aria-label="Zapsat aktivitu: ${esc(item.label)}">Zapsat aktivitu</button>`:''}</article>`;
}
function dailyMobility(settings,date,today) {
  if(!(settings.habits||[]).includes('mobility'))return '';
  const checked=(settings.habitChecks||[]).some(check=>check.id===date+':mobility');
  return `<button type="button" class="plan-mobility ${checked?'is-complete':''}" data-action="toggle-habit" data-habit-id="mobility" data-habit-date="${date}" aria-pressed="${checked}" ${date>today?'disabled':''}>${checked?'✓':'○'} Denní mobilita</button>`;
}
export function renderTodayPlan(settings,date=new Date()) {
  const today=typeof date==='string'?date:localDate(date),summary=planWeekSummary(settings,date),day=summary.days.find(item=>item.date===today);
  return `<section class="panel plan-today"><div class="panel-header"><div><h2 class="panel-title">${day.rest?esc(day.rest.label):'Dnes podle mého plánu'}</h2><p class="panel-subtitle">${day.rest?'Plnění plánu a cílů má pauzu. Skutečné aktivity zapisuj dál podle sebe.':day.items.length?'Tvůj vlastní rytmus. Položky si odškrtni podle skutečnosti.':'Kolo, fitko, bazén i vlastní činnosti. Nastav si svůj týden.'}</p></div><button class="button ghost small" data-view="plan">Můj plán →</button></div>${dailyMobility(settings,today,localDate())}${day.items.map(item=>planItemCard(item,localDate())).join('')}${summary.total||summary.paused?`<p class="form-hint">Tento týden odškrtnuto ${summary.completed} z ${summary.total} položek.${summary.paused?' Dalších '+summary.paused+' položek má pauzu.':''} Čas a cviky doplníš přes Zapsat aktivitu.</p>`:''}</section>`;
}
export function renderWeeklyPlan(settings,date=new Date()) {
  const today=localDate(),summary=planWeekSummary(settings,date);
  return `<section class="panel plan-week"><div class="panel-header"><div><h2 class="panel-title">Můj týdenní rytmus</h2><p class="panel-subtitle">${summary.completed} z ${summary.total} položek odškrtnuto.${summary.paused?' '+summary.paused+' položek má pauzu.':''}</p></div><div class="week-navigation"><button class="icon-button" data-action="plan-prev" aria-label="Předchozí týden">‹</button><span>${summary.days[0].date.split('-').reverse().slice(0,2).join('. ')} – ${summary.days[6].date.split('-').reverse().slice(0,2).join('. ')}</span><button class="icon-button" data-action="plan-next" aria-label="Další týden">›</button><button class="button ghost small" data-action="plan-today">Dnes</button></div></div><div class="plan-days">${summary.days.map(day=>`<section class="plan-day ${day.date===today?'is-today':''} ${day.rest?'has-rest':''}"><h3>${PLAN_DAYS[day.weekday]} <small>${day.date.split('-').reverse().slice(0,2).join('. ')}</small></h3>${day.rest?`<span class="rest-tag">${esc(day.rest.label)}</span>`:''}${dailyMobility(settings,day.date,today)}${day.items.length?day.items.map(item=>planItemCard(item,today)).join(''):'<p class="form-hint">Volný prostor.</p>'}</section>`).join('')}</div><p class="form-hint">Opakovaný osobní rytmus. Dny volnějšího režimu se nezapočítávají do plnění plánu; skutečné zápisy ve statistikách zůstávají.</p></section>`;
}

export function suggestWeeklyRhythm(input) {
  const counts=Object.fromEntries(rhythmTypes.map(type=>[type,Number(input[type]||0)]));
  if(Object.values(counts).some(count=>!Number.isInteger(count)||count<0||count>7)||Object.values(counts).reduce((a,b)=>a+b,0)<1||Object.values(counts).reduce((a,b)=>a+b,0)>14)throw new Error('Zvol 1 až 14 aktivit týdně, nejvýše 7 od jednoho druhu.');
  const plan=[],occupancy=Array(7).fill(0),labels={strength:'Fitko',cycling:'Kolo',cardio:'Plavání / bazén',hiking:'Výšlap'};
  const add=(type,weekday)=>{plan.push({id:'plan-'+crypto.randomUUID(),weekday,type,label:labels[type]});occupancy[weekday]++;};
  for(let index=0;index<counts.strength;index++)add('strength',counts.strength===1?2:Math.floor(index*7/counts.strength));
  const preferences={hiking:[5,6,3,1,0,2,4],cycling:[1,3,6,5,0,2,4],cardio:[3,6,1,5,0,2,4]};
  for(const type of ['hiking','cycling','cardio'])for(let index=0;index<counts[type];index++) {
    const used=new Set(plan.filter(item=>item.type===type).map(item=>item.weekday)),available=preferences[type].filter(day=>!used.has(day));
    const day=available.reduce((best,day)=>occupancy[day]<occupancy[best]?day:best,available[0]);add(type,day);
  }
  return plan.sort((a,b)=>a.weekday-b.weekday);
}
function rhythmEditor() {
  return `<details class="rhythm-builder"><summary>Navrhnout rytmus podle počtu aktivit</summary><p class="form-hint">Zvol vlastní počty. Prohlédneš si návrh a pak ho můžeš použít.</p><form id="rhythm-form"><div class="form-grid">${[['strength','Fitko',3],['cycling','Kolo',1],['cardio','Plavání / bazén',1],['hiking','Výšlap',1]].map(([id,label,count])=>`<label class="form-field">${label} týdně<input name="${id}" type="number" min="0" max="7" step="1" value="${count}" required /></label>`).join('')}</div><button class="button secondary" type="submit">Ukázat návrh týdne</button></form><div id="rhythm-preview"></div></details>`;
}

export function renderPlanEditor(settings) {
  const {weeklyPlan} = planningSettings(settings);
  return `<section class="panel plan-editor"><div class="panel-header"><div><h2 class="panel-title">Sestav si vlastní plán</h2><p class="panel-subtitle">Přidej si pohyb, odpočinek, práci nebo cokoliv svého.</p></div></div><form id="plan-form"><div class="form-grid"><label class="form-field">Den<select name="weekday" required>${PLAN_DAYS.map((day, index) => `<option value="${index}">${day}</option>`).join('')}</select></label><label class="form-field">Typ činnosti<select name="type" required>${PLAN_KINDS.filter(type => !['steps','moment','other'].includes(type.id)).map(type => `<option value="${type.id}">${esc(type.id === 'cardio' ? 'Kardio / bazén' : type.label)}</option>`).join('')}<option value="other">Vlastní činnost</option></select></label><label class="form-field full">Jak si položku pojmenuješ?<input name="label" maxlength="80" required placeholder="Např. kolo, fitko A, bazén, práce, učení…" /></label></div><button class="button primary" type="submit" ${weeklyPlan.length >= MAX_ITEMS ? 'disabled' : ''}>Přidat do mého týdne</button></form>${weeklyPlan.length ? `<div class="plan-edit-list">${[...weeklyPlan].sort((a,b) => a.weekday - b.weekday).map(item => `<div class="plan-edit-item"><div><strong>${esc(item.label)}</strong><small>${PLAN_DAYS[item.weekday]} · ${esc(typeLabel(item.type))}</small></div><button type="button" class="button ghost small" data-action="remove-plan" data-plan-id="${esc(item.id)}" aria-label="Odebrat z plánu: ${esc(item.label)}">Odebrat</button></div>`).join('')}</div>` : ''}<p class="form-hint">Úpravy platí pro celý opakovaný plán. Odebrání položky nesmaže zapsané aktivity.</p>${rhythmEditor()}</section>`;
}

export async function handlePlanAction(name, element, {persist, render, notify, openActivity, getSettings}) {
  if(name==='apply-rhythm'){
    const draft=JSON.parse(element.closest('#rhythm-preview').dataset.suggestion);
    await persist(current=>{const existing=current.settings.weeklyPlan||[],replacement=draft.map(item=>{const previous=existing.find(old=>old.type===item.type&&old.weekday===item.weekday);return previous?{...item,id:previous.id,label:previous.label}:item;});const weeklyPlan=[...existing.filter(item=>!rhythmTypes.includes(item.type)),...replacement];return {...current,settings:{...current.settings,...planningSettings({...current.settings,weeklyPlan})},onboardingComplete:true};});
    render();notify('Nový týdenní rytmus je uložený. Osobní položky zůstaly zachované.');return true;
  }
  if (!['toggle-plan', 'remove-plan', 'plan-log'].includes(name)) return false;
  const id = element.dataset.planId;
  if (name === 'plan-log') {
    const item = getSettings?.().weeklyPlan?.find(plan => plan.id === id);
    if (!item || !loggable(item.type)) throw new Error('Položka plánu už neexistuje.');
    await openActivity(item.type, element.dataset.planDate, item.label);
    return true;
  }
  await persist(current => {
    const plan = name === 'toggle-plan' ? togglePlanCheck(current.settings, id, element.dataset.planDate) : removePlanItem(current.settings, id);
    return {...current, settings:{...current.settings, ...plan}, onboardingComplete:true};
  });
  render();
  notify(name === 'remove-plan' ? 'Položka byla odebrána z týdenního plánu.' : 'Plán je uložený.');
  return true;
}

export async function handlePlanSubmit(event, {persist, render, notify}) {
  if(event.target.id==='rhythm-form'){
    event.preventDefault();const draft=suggestWeeklyRhythm(Object.fromEntries(new FormData(event.target))),target=document.querySelector('#rhythm-preview');
    target.dataset.suggestion=JSON.stringify(draft);target.innerHTML=`<div class="rhythm-preview-days">${PLAN_DAYS.map((day,index)=>`<div><strong>${day}</strong><span>${draft.filter(item=>item.weekday===index).map(item=>`<i style="--plan-color:${color(item.type)}">${esc(item.label)}</i>`).join('')||'Volný prostor'}</span></div>`).join('')}</div><p class="form-hint">Použití nahradí fitko, kolo, plavání a výšlapy v opakovaném rytmu. Ostatní osobní položky i skutečné zápisy zůstanou.</p><button type="button" class="button primary" data-action="apply-rhythm">Použít tento rytmus</button>`;return 'preview';
  }
  if (event.target.id !== 'plan-form') return false;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  const item = {id:`plan-${crypto.randomUUID()}`, weekday:Number(values.weekday), label:values.label, type:values.type};
  const button = event.target.querySelector('[type="submit"]');
  if (button) button.disabled = true;
  try {
    await persist(current => ({...current, settings:{...current.settings, ...addPlanItem(current.settings, item)}, onboardingComplete:true}));
    render(); notify('Tvůj týdenní plán je uložený.');
  } finally {if (button?.isConnected) button.disabled = false;}
  return true;
}
