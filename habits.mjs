import {localDate} from './domain.mjs';
import {personalSettings} from './personal.mjs';

export const HABITS=Object.freeze([
  Object.freeze({id:'mobility',label:'Mobilita',description:'Dal/a jsem si svoji mobilitu. Jen fajfka, bez povinných minut.'}),
  Object.freeze({id:'vitamins',label:'Vitamíny / doplňky',description:'Vzal/a jsem si svoje vitamíny nebo doplňky.'}),
  Object.freeze({id:'protein',label:'Bílkoviny',description:'Splnil/a jsem svůj vlastní cíl bílkovin.'}),
]);
export const habitDefinitions=settings=>[...HABITS,...personalSettings(settings).customHabits.map(h=>({id:h.id,label:h.name,description:h.note,archived:h.archived,target:h.target}))];
const validDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01')return false;
  const parsed=new Date(`${value}T12:00:00`);
  return Number.isFinite(parsed.getTime())&&localDate(parsed)===value;
};

/** Small optional personal checkboxes, independent of exercise volume and goals. */
export function habitSettings(input={},today=localDate()) {
  const habits=input.habits??[],checks=input.habitChecks??[];
  const definitions=habitDefinitions(input),known=id=>definitions.some(h=>h.id===id);
  if(!validDate(today)||!Array.isArray(habits)||habits.length>definitions.length||habits.some(id=>!known(id))||new Set(habits).size!==habits.length)throw new Error('Vyber platné osobní návyky.');
  if(!Array.isArray(checks)||checks.length>2000)throw new Error('Historie návyků může mít nejvýše 2 000 splnění.');
  const used=new Set();
  const habitChecks=checks.map(check=>{
    if(!check||!known(check.habitId)||!validDate(check.date)||check.date>today||check.id!==`${check.date}:${check.habitId}`||used.has(check.id))throw new Error('Splnění návyku potřebuje platný den a jedinečný záznam.');
    used.add(check.id);
    return {id:check.id,date:check.date,habitId:check.habitId};
  });
  return {habits:[...habits],habitChecks};
}

export function toggleHabit(settings,habitId,date=localDate(),today=localDate()) {
  const normalized=habitSettings(settings,today);
  if(!normalized.habits.includes(habitId)||!validDate(date)||date>today)throw new Error('Nejprve zapni návyk a zvol dnešní nebo minulý den.');
  const id=`${date}:${habitId}`,exists=normalized.habitChecks.some(check=>check.id===id);
  const checks=exists?normalized.habitChecks.filter(check=>check.id!==id):[...normalized.habitChecks,{id,date,habitId}];
  return {...normalized,habitChecks:checks.sort((a,b)=>a.id.localeCompare(b.id)).slice(-2000)};
}

export function renderTodayHabits(settings,today=localDate(),open=false) {
  const {habits,habitChecks}=habitSettings(settings,today);
  if(!habits.length)return '';
  const checked=new Set(habitChecks.filter(check=>check.date===today).map(check=>check.habitId));
  return `<details class="today-habits" ${open?'open':''}><summary>Malé návyky <small>${habits.filter(id=>checked.has(id)).length} / ${habits.length} dnes</small></summary><div class="habit-buttons">${habitDefinitions(settings).filter(habit=>habits.includes(habit.id)&&!habit.archived).map(habit=>`<button class="habit-check ${checked.has(habit.id)?'is-complete':''}" type="button" data-action="toggle-habit" data-habit-id="${habit.id}" aria-pressed="${checked.has(habit.id)}"><span aria-hidden="true">${checked.has(habit.id)?'✓':'○'}</span><span><strong>${escapeHabit(habit.label)}</strong><small>${escapeHabit(habit.description)}</small></span></button>`).join('')}</div><p class="form-hint">Tvoje osobní připomínky. Zapneš je nebo vypneš v Mých modulech.</p></details>`;
}

export function renderHabitSettings(settings) {
  const {habits}=habitSettings(settings);
  return `<section class="panel habit-settings"><div class="panel-header"><div><h2 class="panel-title">Drobné návyky, když je chceš</h2><p class="panel-subtitle">Zapni si jen to, co využiješ. Vypnutí uchová historii.</p></div></div>${habitDefinitions(settings).map(habit=>`<label class="habit-setting"><span><strong>${escapeHabit(habit.label)}</strong><small>${escapeHabit(habit.description)}${habit.target?' · cíl '+habit.target+' dní týdně':''}</small></span><span class="switch"><input type="checkbox" class="switch-input" data-habit="${habit.id}" aria-label="Návyk ${escapeHabit(habit.label)}" ${habits.includes(habit.id)?'checked':''} /><span></span></span></label>`).join('')}<form id="custom-habit-form"><div class="form-grid"><label class="form-field">Vlastní návyk<input name="name" maxlength="100" required></label><label class="form-field">Dní týdně<input name="target" type="number" min="1" max="7" value="3" required></label><label class="form-field">Poznámka<input name="note" maxlength="500"></label></div><button class="button secondary">Přidat vlastní návyk</button></form></section>`;
}
const escapeHabit=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderHabitJournal(settings,date=localDate()) {
  const normalized=habitSettings(settings),definitions=habitDefinitions(settings),checked=new Set(normalized.habitChecks.filter(c=>c.date===date).map(c=>c.habitId));
  return `<section class="panel"><h2 class="panel-title">Společný zápis návyků</h2><label class="form-field">Den zápisu návyků<input id="habit-log-date" type="date" max="${localDate()}" value="${date}"></label><div class="habit-buttons">${definitions.filter(h=>normalized.habits.includes(h.id)||checked.has(h.id)).map(h=>`<button class="habit-check ${checked.has(h.id)?'is-complete':''}" data-action="toggle-habit" data-habit-id="${h.id}" data-habit-date="${date}" aria-pressed="${checked.has(h.id)}">${checked.has(h.id)?'✓':'○'} ${escapeHabit(h.label)}</button>`).join('')}</div><p class="form-hint">Jen skutečně splněné návyky pro vybraný den. Prázdný den znamená bez zápisu.</p></section>${personalSettings(settings).customHabits.map(h=>`<section class="panel"><details><summary>Upravit návyk: ${escapeHabit(h.name)}</summary><form class="custom-habit-editor" data-habit-id="${h.id}"><label class="form-field">Název návyku<input name="name" maxlength="100" value="${escapeHabit(h.name)}" required></label><label class="form-field">Dní týdně<input name="target" type="number" min="1" max="7" value="${h.target}" required></label><label class="form-field">Poznámka<input name="note" maxlength="500" value="${escapeHabit(h.note)}"></label><label><input name="archived" type="checkbox" ${h.archived?'checked':''}> Dřívější návyk · uchovat historii</label><button class="button secondary">Uložit návyk</button></form></details></section>`).join('')}`;
}
