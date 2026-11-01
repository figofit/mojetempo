import {emptyDiary} from './sync-rules.mjs';
import {personalSettings} from './personal.mjs';
import {habitDefinitions,renderTodayHabits,renderHabitSettings} from './habits.mjs';
import {localDate} from './domain.mjs';
const original=window.OldaOriginal;
// Presentation is deployment-owned. The public source contains only a template.
try {
  const response=await fetch('/api/presentation',{cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(response.ok){const {profile}=await response.json();Object.assign(original.profile,profile);localStorage.setItem('itfit-personal-presentation',JSON.stringify(profile));}
}catch{try{Object.assign(original.profile,JSON.parse(localStorage.getItem('itfit-personal-presentation')||'{}'));}catch{}}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const routes={home:'overview',train:'diary',habits:'modules',progress:'stats',chronicle:'chronicle',settings:'settings',plan:'plan'};
function projection(state) {
  const personal=personalSettings(state.settings),days=new Map();
  const day=date=>{if(!days.has(date))days.set(date,{date,habits:[],steps:null,energy:null,note:''});return days.get(date);};
  for(const check of state.settings.habitChecks||[])day(check.date).habits.push(check.habitId);
  for(const entry of state.entries) {
    if(entry.steps)day(entry.date).steps=(day(entry.date).steps||0)+entry.steps;
    if(entry.type==='day'){const d=day(entry.date);d.energy=entry.energy??null;d.note=entry.note;}
  }
  const sessions=state.entries.filter(e=>!['moment','day','steps'].includes(e.type)).map(e=>({id:e.id,date:e.date,title:e.title||e.type,category:e.type==='strength'?'strength':e.type==='mobility'?'mobility':['walking','hiking'].includes(e.type)?'walk':['cardio','cycling'].includes(e.type)?'cardio':'other',minutes:e.duration,together:e.together===true,note:e.note,exercises:(e.workout?.exercises||e.exerciseDetails||[]).map(x=>({name:x.name,sets:x.sets,reps:x.reps??0,weight:x.weight??0}))}));
  return {...original.seed,profile:{...original.profile,...(personal.personalProfile||{}),startDate:state.settings.trainingSince||''},plan:{...personal.personalPlan,title:personal.personalPlan.title||original.seed.plan.title},sessions,days:[...days.values()],habits:habitDefinitions(state.settings).map(h=>({id:h.id,name:h.label,note:h.description,target:h.target||7,archived:h.archived||!state.settings.habits.includes(h.id)})),milestones:state.entries.filter(e=>e.type==='moment').map(e=>({id:e.id,date:e.date,title:e.title,note:e.note}))};
}
window.ITFIT_ORIGINAL={
  routes,labels:{overview:'Přehled',diary:'Tréninky a aktivity',plan:'Tvůj plán',chronicle:'Kronika',stats:'Pokrok',modules:'Návyky a moduly'},
  overview(state,account) {
    const allowed=!!account.diary;
    const body=original.home(projection(allowed?state:emptyDiary()));
    const intro=allowed?'':`<section class="card private-entry"><h2>Tvůj osobní deník.</h2><p>Oldo, přihlas se svým účtem Moje IT FIT. Tvoje zápisy uvidíš tady i v Moje IT FIT.</p>${account.user?'<p>Tento účet nemá přístup k Oldovu deníku.</p><button class="button ghost" data-action="logout-account">Odhlásit tento účet</button>':'<button class="button primary" data-action="open-account">Přihlásit se</button>'}</section>`;
    return body.replace('</section><div class="stats">',`</section>${intro}<div class="stats">`);
  }
};
document.querySelector('#app').innerHTML=`<div class="shell"><aside class="sidebar"><a class="brand" href="#overview" aria-label="ITFIT, Oldův přehled"><svg class="mark" viewBox="0 0 30 30" aria-hidden="true"><path stroke="currentColor" stroke-width="4" d="M4 25V5h21M4 15h16"/></svg><span>IT<b>FIT</b></span></a><p class="sidebar-label">TVŮJ OSOBNÍ PROSTOR</p><nav class="nav" id="main-nav" aria-label="Hlavní navigace"></nav><div class="sidebar-bottom"><button id="settings-nav" class="nav-item" data-view="settings"></button><button id="demo-toggle" hidden></button><div class="client-chip sidebar-profile"><span class="avatar">O</span><div><strong>Olda 4.0</strong><small id="account-profile">Píšeme to spolu.</small></div></div></div></aside><div class="main-wrap"><header class="topbar"><div class="crumb">${original.icon('spark')}<strong>Olda 4.0</strong><span>/</span><span id="breadcrumb-current">Přehled</span></div><div class="top-actions"><span class="badge" id="privacy-label">JEN TVOJE KAPITOLA</span><button id="install-app" class="small-btn" data-action="install-app">${original.icon('mobile')}Do mobilu</button></div></header><div id="pwa-status"></div><div id="pwa-update"></div><div id="account-status"></div><div id="demo-banner" hidden></div><main id="main" class="page"><div id="view-content"></div></main><footer class="footer"><span>ITFIT · Olda 4.0<br>Píšeme to spolu.</span><button class="coach-entry" data-action="open-account" aria-label="Otevřít společný zápis">↗</button></footer></div></div>`;
document.querySelector('#toast').className='toast hidden';
// Keep the original home links working while the shared engine uses its views.
document.addEventListener('click',event=>{
  const entry=event.target.closest('.coach-entry');
  if(entry&&document.querySelector('#account-profile').dataset.signedIn==='true') {
    event.stopImmediatePropagation();document.body.classList.toggle('olda-editing');
    entry.setAttribute('aria-label',document.body.classList.contains('olda-editing')?'Ukončit společný zápis':'Otevřít společný zápis');
  }
});
await import('./tempo-app.js');
