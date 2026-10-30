import {localDate} from './domain.mjs';

export const HABITS=Object.freeze([
  Object.freeze({id:'mobility',label:'Mobilita',description:'Dal/a jsem si svoji mobilitu. Jen fajfka, bez povinných minut.'}),
  Object.freeze({id:'vitamins',label:'Vitamíny / doplňky',description:'Vzal/a jsem si svoje vitamíny nebo doplňky.'}),
  Object.freeze({id:'protein',label:'Bílkoviny',description:'Splnil/a jsem svůj vlastní cíl bílkovin.'}),
]);
const known=id=>HABITS.some(habit=>habit.id===id);
const validDate=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01')return false;
  const parsed=new Date(`${value}T12:00:00`);
  return Number.isFinite(parsed.getTime())&&localDate(parsed)===value;
};

/** Small optional personal checkboxes, independent of exercise volume and goals. */
export function habitSettings(input={},today=localDate()) {
  const habits=input.habits??[],checks=input.habitChecks??[];
  if(!validDate(today)||!Array.isArray(habits)||habits.length>HABITS.length||habits.some(id=>!known(id))||new Set(habits).size!==habits.length)throw new Error('Vyber platné osobní návyky.');
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
  return `<details class="today-habits" ${open?'open':''}><summary>Malé návyky <small>${habits.filter(id=>checked.has(id)).length} / ${habits.length} dnes</small></summary><div class="habit-buttons">${HABITS.filter(habit=>habits.includes(habit.id)).map(habit=>`<button class="habit-check ${checked.has(habit.id)?'is-complete':''}" type="button" data-action="toggle-habit" data-habit-id="${habit.id}" aria-pressed="${checked.has(habit.id)}"><span aria-hidden="true">${checked.has(habit.id)?'✓':'○'}</span><span><strong>${habit.label}</strong><small>${habit.description}</small></span></button>`).join('')}</div><p class="form-hint">Tvoje osobní připomínky. Zapneš je nebo vypneš v Mých modulech.</p></details>`;
}

export function renderHabitSettings(settings) {
  const {habits}=habitSettings(settings);
  return `<section class="panel habit-settings"><div class="panel-header"><div><h2 class="panel-title">Drobné návyky, když je chceš</h2><p class="panel-subtitle">Jednoduché fajfky v rozbalovací části Dnes. Zapni si jen to, co využiješ.</p></div></div>${HABITS.map(habit=>`<label class="habit-setting"><span><strong>${habit.label}</strong><small>${habit.description}</small></span><span class="switch"><input type="checkbox" class="switch-input" data-habit="${habit.id}" aria-label="Návyk ${habit.label}" ${habits.includes(habit.id)?'checked':''} /><span></span></span></label>`).join('')}<p class="form-hint">Bílkoviny si označíš podle svého cíle. Vypnutí uchová dosavadní odškrtnutí.</p></section>`;
}
