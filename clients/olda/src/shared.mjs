import {personalSettings} from './personal.mjs';
const original=window.OldaOriginal;
// Presentation is deployment-owned. The public source contains only a template.
try {
  const response=await fetch('/api/presentation',{cache:'no-store',signal:AbortSignal.timeout(4000)});
  if(response.ok){const {profile}=await response.json();Object.assign(original.profile,profile);localStorage.setItem('itfit-personal-presentation',JSON.stringify(profile));}
}catch{try{Object.assign(original.profile,JSON.parse(localStorage.getItem('itfit-personal-presentation')||'{}'));}catch{}}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Old links keep working; new short names follow the five tabs.
const routes={home:'overview',tyden:'overview',train:'diary',zapisy:'diary',habits:'modules',progress:'stats',pokrok:'stats',kronika:'chronicle',vice:'more',settings:'settings',plan:'plan'};
const DAY_SHORT=['Po','Út','St','Čt','Pá','So','Ne'];
const DAY_IN=['v pondělí','v úterý','ve středu','ve čtvrtek','v pátek','v sobotu','v neděli'];
const DAY_NAME=['pondělí','úterý','středa','čtvrtek','pátek','sobota','neděle'];
const dayNumber=date=>Number(date.slice(8,10));
const stamp=date=>`${dayNumber(date)}. ${Number(date.slice(5,7))}.`;
const editing=()=>document.body.classList.contains('olda-editing');

function askCard(week,cardio,ctx) {
  const pending=week.slots.filter(slot=>slot.status==='pending'&&!slot.future);
  const lock=`<div class="olda-readnote">${ctx.icon('shield')}<span>${ctx.signedIn?'Odpovídáte spolu. Zápis odemkneš tlačítkem <b>Jen čtení</b> nahoře.':'Odpovídáte spolu s Michalem. Pro zápis se přihlas tlačítkem nahoře.'}</span></div>`;
  if(pending.length) {
    const slot=pending[0];
    const buttons=`<div class="olda-answer"><button class="button primary" data-action="routine-answer" data-slot-id="${esc(slot.id)}" data-slot-date="${slot.date}" data-answer="yes">${ctx.icon('check')}Ano, byl</button><button class="button secondary" data-action="routine-answer" data-slot-id="${esc(slot.id)}" data-slot-date="${slot.date}" data-answer="no">Tentokrát ne</button></div><p class="olda-hint">„Ano“ přičte jeden trénink. „Tentokrát ne“ nic nekazí, jen se nezapíše.</p>`;
    return `<section class="olda-ask"><p class="eyebrow">ČEKÁ NA POTVRZENÍ${pending.length>1?' · '+pending.length:''}</p><h2>Byl jsi ${DAY_IN[slot.weekday]} na tréninku?</h2><p class="olda-ask-sub">${esc(slot.label)} · ${stamp(slot.date)}</p>${ctx.canWrite?buttons:lock}</section>`;
  }
  const next=week.slots.find(slot=>slot.status==='pending'&&slot.future);
  const cardioLeft=cardio.config?Math.max(0,cardio.config.target-cardio.completed):0;
  const title=next?`Další na řadě: ${DAY_NAME[next.weekday]}, ${esc(next.label)}.`:week.total?'Silový týden je hotový.':'Týden bez pevného plánu.';
  return `<section class="olda-ask is-calm"><p class="eyebrow">VŠECHNO ZAPSANÉ</p><h2>${title}</h2>${cardio.config?`<p class="olda-ask-sub">Kardio tento týden: ${cardio.completed}×${cardioLeft?'. Další zapíšeš níže.':'.'}</p>`:''}</section>`;
}

function weekStrip(week,cardio,today) {
  const cardioDays=new Set(cardio.records.map(entry=>entry.date));
  return `<div class="olda-strip">${week.dates.map((date,index)=>{
    const slot=week.slots.find(item=>item.date===date);
    let pip='<span class="olda-pip is-empty"></span>';
    if(slot)pip=`<span class="olda-pip ${slot.status==='done'?'is-yes':slot.status==='missed'?'is-no':'is-plan'}" aria-label="${slot.status==='done'?'splněno':slot.status==='missed'?'tentokrát ne':'naplánováno'}">${slot.status==='done'?'✓':''}</span>`;
    const heart=cardioDays.has(date)?'<span class="olda-pip is-cardio" aria-label="kardio">♥</span>':'';
    return `<div class="olda-day ${date===today?'is-today':''}"><span>${DAY_SHORT[index]}</span><b>${dayNumber(date)}</b>${pip}${heart}</div>`;
  }).join('')}</div>`;
}

function slotRows(week,ctx) {
  if(!week.slots.length)return '<p class="olda-hint">Silový rytmus zatím není nastavený. Najdeš ho ve Více → Tvůj plán.</p>';
  return `<div class="olda-slots">${week.slots.map(slot=>{
    const state=slot.status==='done'?'<span class="olda-state is-yes">Splněno</span>':slot.status==='missed'?'<span class="olda-state is-no">Tentokrát ne</span>':slot.future?'<span class="olda-state is-next">Naplánováno</span>':'<span class="olda-state">Čeká</span>';
    const reset=ctx.canWrite&&slot.status!=='pending'?`<button class="olda-link" data-action="routine-answer" data-slot-id="${esc(slot.id)}" data-slot-date="${slot.date}" data-answer="reset">Změnit</button>`:'';
    return `<div class="olda-slot"><span class="olda-when">${DAY_SHORT[slot.weekday]} ${stamp(slot.date)}</span><span class="olda-what">${esc(slot.label)}<small>${slot.together?(/michal/i.test(slot.label)?'Společný trénink':'Spolu s Michalem'):'Síla'}${slot.jointOrdinal?' · společný #'+slot.jointOrdinal:''}</small></span>${state}${reset}</div>`;
  }).join('')}</div>`;
}

function cardioBlock(cardio,ctx) {
  if(!cardio.config)return '';
  const active=cardio.end>=cardio.config.since&&cardio.start<=ctx.today&&cardio.config.since<=ctx.today;
  const open=cardio.slots.find(slot=>!slot.entry);
  const days=cardio.records.map(entry=>`<span class="olda-chip">${DAY_SHORT[(new Date(entry.date+'T12:00:00').getDay()+6)%7]} ${stamp(entry.date)}</span>`).join('');
  const choices=[];
  for(const date of ctx.weekDates)if(date<=ctx.today&&date>=cardio.config.since)choices.push(date);
  const picker=ctx.canWrite&&active&&open&&choices.length?`<div class="olda-cardio-add"><label class="olda-select">Den<select id="cardio-date">${choices.map(date=>`<option value="${date}" ${date===ctx.today?'selected':''}>${DAY_SHORT[ctx.weekDates.indexOf(date)]} ${stamp(date)}${date===ctx.today?' · dnes':''}</option>`).join('')}</select></label><button class="button primary small" data-action="cardio-answer" data-cardio-index="${open.index}" data-cardio-week="${cardio.start}" data-cardio-complete="true">${ctx.icon('plus')}Zapsat kardio</button></div>`:'';
  const last=[...cardio.slots].reverse().find(slot=>slot.entry);
  const undo=ctx.canWrite&&active&&last?`<button class="olda-link" data-action="cardio-answer" data-cardio-index="${last.index}" data-cardio-week="${cardio.start}" data-cardio-complete="false">Zrušit poslední</button>`:'';
  return `<div class="olda-cardio"><div class="olda-cardio-head"><span>${esc(cardio.config.label)} · ideálně ${cardio.config.target}× týdně, kdykoliv</span>${undo}</div>${days?`<div class="olda-chips">${days}</div>`:''}${picker}</div>`;
}

const word=(n,one,few,many)=>n===1?one:n>=2&&n<=4?few:many;
function meters(week,cardio,ctx) {
  const bar=(done,max,cls)=>`<div class="olda-bar ${cls}">${Array.from({length:Math.max(1,max)},(_,i)=>`<i class="${i<done?'is-full':''}"></i>`).join('')}</div>`;
  const strength=`<div class="olda-meter"><div><span>Síla</span>${ctx.icon('dumbbell')}</div><strong>${week.completed}<small> ${word(week.completed,'trénink','tréninky','tréninků')}</small></strong>${bar(week.completed,week.total,'')}<small class="olda-ideal">ideálně ${week.total}× týdně</small></div>`;
  const heart=cardio.config?`<div class="olda-meter is-cardio"><div><span>Kardio</span>${ctx.icon('heart')}</div><strong>${Math.min(cardio.completed,99)}<small>×</small></strong>${bar(cardio.completed,cardio.config.target,'is-cardio')}<small class="olda-ideal">ideálně ${cardio.config.target}× týdně</small></div>`:'';
  return `<div class="olda-meters">${strength}${heart}</div>`;
}

function letter(profile) {
  return `<button class="olda-letter" popovertarget="olda-letter-sheet"><span class="olda-seal">40</span><span><strong>Vzkaz k narozeninám</strong><small>${esc(profile.signature)} · otevřeš kdykoliv</small></span></button><div id="olda-letter-sheet" class="olda-sheet" popover><p class="eyebrow">OLDA 4.0</p><h2>Vzkaz k narozeninám</h2><p class="olda-letter-body">${esc(profile.dedication)}</p><p class="signature">${esc(profile.signature)}</p><button class="button secondary" popovertarget="olda-letter-sheet" popovertargetaction="hide">Zavřít</button></div>`;
}

window.ITFIT_ORIGINAL={
  routes,
  nav:{overview:'calendar',diary:'book',stats:'chart',chronicle:'image',more:'layers'},
  labels:{overview:'Týden',diary:'Zápisy',stats:'Pokrok',chronicle:'Kronika',more:'Více',plan:'Tvůj plán',modules:'Návyky a moduly',settings:'Cíle a nastavení'},
  overview(state,account,ctx={}) {
    const allowed=!!account.diary||account.publicRead,profile={...original.profile,...(personalSettings(state.settings).personalProfile||{})};
    if(!allowed)return '<section class="card private-entry"><h1>Oldův osobní prostor</h1><p>Aktuální přehled se právě načítá. Pro zápis se přihlas tlačítkem nahoře.</p><button class="button ghost" data-action="sync-account">Obnovit přehled</button></section>'+letter(profile);
    const {week,cardio,today}=ctx;
    const current=week.dates.includes(today);
    const greeting=new Date(today+'T12:00:00').toLocaleDateString('cs-CZ',{weekday:'long',day:'numeric',month:'long'});
    return `<div class="olda-hello"><p class="eyebrow">${esc(greeting)}</p><h1>Ahoj ${esc(profile.salutation||'Oldo')}.<br>Jak jde tenhle týden?</h1></div>
      ${current?askCard(week,cardio,ctx):''}
      <section class="olda-card olda-week"><div class="olda-week-head"><h2>${current?'Tvůj týden':'Týden '+stamp(week.dates[0])+' – '+stamp(week.dates[6])}</h2><div class="olda-week-nav"><button class="olda-round" data-action="routine-prev" aria-label="Předchozí týden">‹</button>${current?'':'<button class="olda-link" data-action="routine-today">Tento týden</button>'}<button class="olda-round" data-action="routine-next" aria-label="Další týden">›</button></div></div>${weekStrip(week,cardio,today)}${slotRows(week,ctx)}${cardioBlock(cardio,{...ctx,weekDates:week.dates})}${ctx.canWrite?`<button class="button secondary olda-add-other" data-action="add">${ctx.icon('plus')}Zapsat jinou aktivitu</button>`:''}</section>
      ${meters(week,cardio,ctx)}
      ${ctx.pulse||''}
      ${letter(profile)}`;
  },
  more(state,account,ctx) {
    const item=(href,symbol,title,text)=>`<a class="olda-row" href="${href}"><span class="olda-row-icon">${ctx.icon(symbol)}</span><span>${title}<small>${text}</small></span><span class="olda-chev">›</span></a>`;
    return `<div class="olda-hello"><p class="eyebrow">NASTAVENÍ A NÁSTROJE</p><h1>Více</h1></div>
      <nav class="olda-list" aria-label="Plán a návyky">${item('#plan','calendar','Tvůj plán','Týdenní rytmus, osobní plán s Michalem')}${item('#modules','layers','Návyky a moduly','Pohyb, regenerace, kroky, vlastní údaje')}${item('#settings','target','Cíle a nastavení','Cíle, volnější režim, poměry sérií')}</nav>
      <nav class="olda-list" aria-label="Účet a aplikace">${item('#settings','shield','Účet a data','Přihlášení, záloha, historie změn')}<button class="olda-row" data-action="install-app"><span class="olda-row-icon">${ctx.icon('download')}</span><span>Do mobilu<small>Přidat Oldův deník na plochu</small></span><span class="olda-chev">›</span></button></nav>
      <p class="olda-hint">ITFIT · Olda 4.0 · Píšeme to spolu.</p>`;
  }
};

document.querySelector('#app').innerHTML=`<div class="shell"><aside class="sidebar"><a class="brand" href="#overview" aria-label="ITFIT, Oldův týden"><svg class="mark" viewBox="0 0 30 30" aria-hidden="true"><path stroke="currentColor" stroke-width="4" d="M4 25V5h21M4 15h16"/></svg><span>IT<b>FIT</b></span></a><p class="sidebar-label">TVŮJ OSOBNÍ PROSTOR</p><nav class="nav" id="main-nav" aria-label="Hlavní navigace"></nav><div class="sidebar-bottom"><button id="settings-nav" class="nav-item" data-view="settings" hidden></button><button id="demo-toggle" hidden></button><div class="client-chip sidebar-profile"><span class="avatar">O</span><div><strong>Olda 4.0</strong><small id="account-profile">Píšeme to spolu.</small></div></div></div></aside><div class="main-wrap"><header class="topbar"><a class="brand olda-topbrand" href="#overview" aria-label="ITFIT, Oldův týden"><svg class="mark" viewBox="0 0 30 30" aria-hidden="true"><path stroke="currentColor" stroke-width="4" d="M4 25V5h21M4 15h16"/></svg><span>IT<b>FIT</b></span></a><div class="crumb">${original.icon('spark')}<strong>Olda 4.0</strong><span>/</span><span id="breadcrumb-current">Týden</span></div><div class="top-actions"><span class="badge" id="privacy-label" hidden>JEN TVOJE KAPITOLA</span><button id="install-app" class="small-btn" data-action="install-app" hidden>${original.icon('mobile')}Do mobilu</button><button class="coach-entry olda-mode" data-action="open-account" aria-pressed="false"><span class="olda-dot"></span><span class="olda-mode-label">Přihlásit k zápisu</span></button></div></header><div id="pwa-status"></div><div id="pwa-update"></div><div id="account-status"></div><div id="demo-banner" hidden></div><main id="main" class="page"><div id="view-content"></div></main><footer class="footer"><span>ITFIT · Olda 4.0<br>Píšeme to spolu.</span></footer></div></div><button class="olda-fab" data-action="add"><span aria-hidden="true">+</span><span>Zapsat</span></button>`;
document.querySelector('#toast').className='toast hidden';

// One clear switch replaces the old arrow: signed in = toggle shared writing, signed out = log in.
document.addEventListener('click',event=>{
  const entry=event.target.closest('.coach-entry');
  if(entry&&document.querySelector('#account-profile').dataset.signedIn==='true') {
    event.stopImmediatePropagation();document.body.classList.toggle('olda-editing');
    window.dispatchEvent(new Event('olda-editing'));
  }
});

// Step-by-step entry: what, when and with whom, then optional details. The form itself stays the shared one.
const dialog=document.querySelector('#entry-dialog'),form=document.querySelector('#entry-form');
if(dialog&&form){
  const steps=document.createElement('div');steps.className='olda-steps';
  steps.innerHTML=['Co','Kdy a s kým','Podrobnosti'].map((label,index)=>`<button type="button" data-olda-step="${index+1}"><i></i><span>${label}</span></button>`).join('');
  const kinds=document.createElement('div');kinds.className='olda-kinds';
  form.prepend(steps,kinds);
  const actions=form.querySelector('.form-actions');
  const back=document.createElement('button');back.type='button';back.className='button secondary olda-back';back.textContent='Zpět';
  const more=document.createElement('button');more.type='button';more.className='button secondary olda-more';more.textContent='Podrobnosti';
  actions.prepend(back);actions.querySelector('#save-entry').before(more);
  const type=form.querySelector('#entry-type');
  const setStep=step=>{
    form.dataset.step=String(step);
    steps.querySelectorAll('button').forEach(button=>button.classList.toggle('is-on',Number(button.dataset.oldaStep)<=step));
    if(step===3){form.querySelector('#entry-details').open=true;form.querySelectorAll('.exercise-library, #mobility-fields>details').forEach(details=>details.open=true);}
    if(step===1){
      kinds.innerHTML=[...type.options].filter(option=>option.value).map(option=>`<button type="button" data-olda-kind="${esc(option.value)}" aria-pressed="${option.value===type.value}">${esc(option.textContent)}</button>`).join('');
    }
    dialog.querySelector('.dialog-body')?.scrollTo?.(0,0);
  };
  steps.addEventListener('click',event=>{const button=event.target.closest('[data-olda-step]');if(button&&type.value)setStep(Number(button.dataset.oldaStep));});
  kinds.addEventListener('click',event=>{
    const button=event.target.closest('[data-olda-kind]');if(!button)return;
    type.value=button.dataset.oldaKind;type.dispatchEvent(new Event('change',{bubbles:true}));setStep(2);
  });
  back.addEventListener('click',()=>setStep(Math.max(1,Number(form.dataset.step)-1)));
  more.addEventListener('click',()=>setStep(3));
  // A new entry starts at the first step; an existing one opens on its date and company.
  new MutationObserver(()=>{if(dialog.open)setStep(/upravit/i.test(dialog.querySelector('#entry-heading')?.textContent||'')?2:1);}).observe(dialog,{attributes:true,attributeFilter:['open']});
}
await import('./tempo-app.js');
