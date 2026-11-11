import {personalSettings} from './personal.mjs';
const original=window.OldaOriginal;
// Presentation is deployment-owned. The public source contains only a template.
try {
  const response=await fetch('/api/presentation',{cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(response.ok){const {profile}=await response.json();Object.assign(original.profile,profile);localStorage.setItem('itfit-personal-presentation',JSON.stringify(profile));}
}catch{try{Object.assign(original.profile,JSON.parse(localStorage.getItem('itfit-personal-presentation')||'{}'));}catch{}}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const routes={home:'overview',train:'diary',habits:'modules',progress:'stats',chronicle:'chronicle',settings:'settings',plan:'plan'};
window.ITFIT_ORIGINAL={
  routes,labels:{overview:'Přehled',diary:'Tréninky a aktivity',plan:'Tvůj plán',chronicle:'Kronika',stats:'Pokrok',modules:'Návyky a moduly'},
  overview(state,account,summary='') {
    const allowed=!!account.diary||account.publicRead,profile={...original.profile,...(personalSettings(state.settings).personalProfile||{})};
    const notice=allowed?'':'<section class="card private-entry"><h1>Oldův osobní prostor</h1><p>Aktuální přehled se právě načítá. Pro zápis použij malou šipku vpravo dole.</p><button class="button ghost" data-action="sync-account">Obnovit přehled</button></section>';
    return notice+(allowed?'<details class="card olda-week-details" '+(document.body.classList.contains('olda-editing')?'open':'')+'><summary>Tréninky a kardio po dnech</summary><div class="olda-week-content">'+summary+'</div></details>':'')+'<details class="card olda-dedication"><summary>Tvůj narozeninový vzkaz</summary><p>'+esc(profile.dedication)+'</p><div class="signature">'+esc(profile.signature)+'</div></details>';
  }
};
document.querySelector('#app').innerHTML=`<div class="shell"><aside class="sidebar"><a class="brand" href="#overview" aria-label="ITFIT, Oldův přehled"><svg class="mark" viewBox="0 0 30 30" aria-hidden="true"><path stroke="currentColor" stroke-width="4" d="M4 25V5h21M4 15h16"/></svg><span>IT<b>FIT</b></span></a><p class="sidebar-label">TVŮJ OSOBNÍ PROSTOR</p><nav class="nav" id="main-nav" aria-label="Hlavní navigace"></nav><div class="sidebar-bottom"><button id="settings-nav" class="nav-item" data-view="settings"></button><button id="demo-toggle" hidden></button><div class="client-chip sidebar-profile"><span class="avatar">O</span><div><strong>Olda 4.0</strong><small id="account-profile">Píšeme to spolu.</small></div></div></div></aside><div class="main-wrap"><header class="topbar"><div class="crumb">${original.icon('spark')}<strong>Olda 4.0</strong><span>/</span><span id="breadcrumb-current">Přehled</span></div><div class="top-actions"><span class="badge" id="privacy-label">JEN TVOJE KAPITOLA</span><button id="install-app" class="small-btn" data-action="install-app">${original.icon('mobile')}Do mobilu</button></div></header><div id="pwa-status"></div><div id="pwa-update"></div><div id="account-status"></div><div id="demo-banner" hidden></div><main id="main" class="page"><div id="view-content"></div></main><footer class="footer"><span>ITFIT · Olda 4.0<br>Píšeme to spolu.</span><button class="coach-entry" data-action="open-account" aria-label="Otevřít společný zápis">↗</button></footer></div></div>`;
document.querySelector('#toast').className='toast hidden';
// Keep the original home links working while the shared engine uses its views.
document.addEventListener('click',event=>{
  const entry=event.target.closest('.coach-entry');
  if(entry&&document.querySelector('#account-profile').dataset.signedIn==='true') {
    event.stopImmediatePropagation();document.body.classList.toggle('olda-editing');
    const editing=document.body.classList.contains('olda-editing');
    entry.setAttribute('aria-label',editing?'Ukončit společný zápis':'Otevřít společný zápis');
    if(editing)document.querySelector('.olda-week-details')?.setAttribute('open','');
  }
});
const sidebar=document.querySelector('.sidebar');
const menuButton=document.createElement('button');
menuButton.id='olda-menu-toggle';menuButton.type='button';menuButton.className='small-btn';
menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-controls','olda-navigation');
menuButton.innerHTML='<span aria-hidden="true">☰</span> Menu';
const navigation=document.createElement('div');navigation.id='olda-navigation';
navigation.append(document.querySelector('#main-nav'),document.querySelector('.sidebar-bottom'));
sidebar.append(menuButton,navigation);
function closeMenu(){sidebar.classList.remove('menu-open');menuButton.setAttribute('aria-expanded','false');}
menuButton.addEventListener('click',()=>{const opened=sidebar.classList.toggle('menu-open');menuButton.setAttribute('aria-expanded',String(opened));});
navigation.addEventListener('click',event=>{if(event.target.closest('a,button[data-view]'))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sidebar.classList.contains('menu-open')){closeMenu();menuButton.focus();}});
window.addEventListener('hashchange',closeMenu);
await import('./tempo-app.js');
