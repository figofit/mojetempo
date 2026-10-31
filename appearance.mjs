/** Presentation only. Both appearances use the same storage and diary model. */
export const OLDA_GIFT=Object.freeze({
  dedication:'Ke čtyřicítce ti přejeme sílu, zdraví a radost z pohybu. Tady bude mít svoje místo každý trénink, malý pokrok i společný zážitek.',
  signature:'Michal a Helenka',
});

export function siteAppearance(address) {
  const url=new URL(address);
  const personal=url.hostname==='olda.itfit.cz';
  const preview=!personal&&url.searchParams.get('vzhled')==='olda';
  return Object.freeze({id:personal||preview?'olda':'tempo',preview,personal,title:personal||preview?'Olda 4.0 · IT FIT':'Moje tempo'});
}

export function applyAppearance(profile,document) {
  document.documentElement.dataset.appearance=profile.id;
  if(profile.id!=='olda')return;
  document.querySelector('meta[name="theme-color"]').content='#11140f';
  const brand=document.querySelector('.brand');
  brand.setAttribute('aria-label','Olda 4.0 · IT FIT, přehled');
  brand.innerHTML='<span class="brand-mark">40</span><span>OLDA <b>4.0</b><span class="brand-subtitle">IT FIT · TVŮJ OSOBNÍ PROSTOR</span></span>';
  document.querySelector('.sidebar-note').innerHTML='<span class="tag">NOVÁ KAPITOLA</span><p>Tréninky, malé návyky a příběh,<br>který píšeme spolu.</p>';
  if(profile.preview){
    const banner=document.createElement('div');
    banner.className='appearance-preview';
    banner.textContent='Náhled Oldova vzhledu · používáš svůj právě otevřený deník.';
    const link=document.createElement('a');
    const url=new URL(document.location.href);url.searchParams.delete('vzhled');
    link.href=url.href;link.textContent='Zpět na Moje IT FIT';
    banner.append(link);document.querySelector('.topbar').after(banner);
  }
}

export function renderOldaWelcome() {
  return `<section class="olda-welcome"><div><p class="eyebrow">VŠECHNO NEJLEPŠÍ KE ČTYŘICÍTCE</p><h1>Oldo,<br>tohle je <span>tvoje.</span></h1><p>Tréninky, malé návyky a příběh,<br>který píšeme spolu. Krok za krokem.</p><small>Nová kapitola začíná skutečnými zápisy.</small></div><div class="olda-forty" aria-hidden="true">40<span>NOVÁ KAPITOLA</span></div></section>`;
}

export function renderOldaGift() {
  return `<section class="olda-gift"><p class="eyebrow">MALÝ DÁREK. VLASTNÍ PŘÍBĚH.</p><h2>Další kapitola<br>patří tobě.</h2><p>${OLDA_GIFT.dedication}</p><div>${OLDA_GIFT.signature}<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></div></section>`;
}
