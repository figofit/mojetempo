(() => {
  'use strict';
  const $ = s => document.querySelector(s), C = FitCore;
  let published = C.validate(JSON.parse($('#itfit-data').textContent));
  const cloudConfig = JSON.parse($('#itfit-config').textContent), cloud = cloudConfig.mode === 'cloud';
  const previewFetch = (url,options) => fetch(url,{...options,headers:{...options.headers,'X-Preview-Role':cloudConfig.previewRole || 'coach'}});
  const client = cloud ? new FitCloudClient(C.validate, localStorage, cloudConfig.preview ? previewFetch : ((...args)=>fetch(...args))) : null;
  let role = null, cloudReady = false, dirty = false, saving = false, conflict = false, draftBaseRevision = '', editGeneration = 0, refreshing = false, cloudError = '', lastLoaded = null, accessDenied = false;
  const assets = JSON.parse($('#itfit-assets').textContent);
  const storageKey = cloud ? 'itfit-olda-4-0-online-draft-v1' : 'itfit-olda-4-0-draft-v1';
  let draft = null, importedPreview = null, page = 'home', period = 'all', sessionFilter = 'all', search = '', installEvent = null, updateReady = false, toastTimer;
  const data = () => draft || importedPreview || published;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const json = x => JSON.stringify(x).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const number = n => new Intl.NumberFormat('cs-CZ').format(n);
  const daysText = n => `${number(n)} ${n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní'}`;
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    train: '<path d="M3 8v8m4-10v12M17 6v12m4-10v8M7 12h10M3 12h4m10 0h4"/>',
    habits: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M7 2v4m10-4v4M3 10h18m-13 5 3 3 5-5"/>',
    chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4"/>',
    book: '<path d="M12 5c-3-2-7-2-10 0v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0Zm0 0v15"/>',
    settings: '<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="m15 4 5 5M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>',
    spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    flag: '<path d="M5 22V3c4-3 10 3 14 0v10c-4 3-10-3-14 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    mobile: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
    link: '<path d="M10 13a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-2 2m2 6a4 4 0 0 0-6 0l-4 4a4 4 0 0 0 6 6l2-2"/>',
  };
  const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[n] || icons.spark}</svg>`;
  const action = (key, label, style = 'primary', ico = 'plus', attrs = '') => `<button class="button ${style}" data-action="${key}" ${attrs}>${icon(ico)}${label}</button>`;
  const empty = (title, text, ico = 'spark', button = '') => `<div class="empty"><div class="empty-symbol">${icon(ico)}</div><h3>${title}</h3><p>${text}</p>${button}</div>`;
  const editButton = (key, id = '', title = 'Upravit') => draft ? `<button class="icon-btn" data-action="${key}" data-id="${esc(id)}" aria-label="${esc(title)}">${icon('edit')}</button>` : '';
  function toast(message, error = false) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').className = `toast visible${error ? ' error' : ''}`; toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5500); }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ baseRevision: draftBaseRevision || published.revision, pending: dirty, data: draft })); }
    catch { toast('Prohlížeč návrh neuložil. Stáhni si JSON zálohu před zavřením.', true); }
  }
  function commit(next) { draft = C.validate(next); dirty = cloud; editGeneration++; persist(); closeModal(); render(); if (cloud) { toast(navigator.onLine ? 'Zápis připravený. Ukládám online…' : 'Zápis je zatím pouze v tomto zařízení. Až bude internet, odešli ho online.'); sendOnline(); } else toast('Zapsáno do společného návrhu.'); }
  function closeModal() { $('#modal').close(); $('#modal').innerHTML = ''; }
  function openModal(title, body) { if (cloud && draft && title==='Otevřít JSON zálohu') body=body.replace(/<p>[\s\S]*?<\/p>/,'<p>Po potvrzení nahradíme celý společný přehled touto zálohou a odešleme jej online. Nejdřív si stáhni současný návrh. Předchozí online verze zůstane v serverové záloze.</p>'); const m = $('#modal'); m.innerHTML = `<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close" aria-label="Zavřít">${icon('close')}</button></div><div class="modal-body">${body}</div>`; m.showModal(); }
  function askInApp(title, message, label, accept) { openModal(title, `<p>${message}</p><div class="backup-actions"><button type="button" class="button ghost" data-action="close">Zrušit</button><button type="button" class="button primary" id="confirm-action">${label}</button></div>`); $('#confirm-action').addEventListener('click', accept); }
  function goto(next) { page = next; render(); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function render() {
    const d = data(), nav = [['home','home','Přehled'],['train','train','Tréninky'],['habits','habits','Návyky'],['progress','chart','Pokrok'],['chronicle','book','Kronika'],['settings','settings','Zázemí']];
    $('#app').innerHTML = `<div class="shell"><aside class="sidebar"><a class="brand" href="#home" data-page="home" aria-label="ITFIT, Oldův přehled"><svg class="mark" viewBox="0 0 30 30" aria-hidden="true"><path stroke="currentColor" stroke-width="4" d="M4 25V5h21M4 15h16"/></svg><span>IT<b>FIT</b></span></a><p class="sidebar-label">TVŮJ OSOBNÍ PROSTOR</p><nav class="nav" aria-label="Hlavní navigace">${nav.map(([key,ico,label]) => `<button data-page="${key}" class="${page === key ? 'active' : ''}" ${page === key ? 'aria-current="page"' : ''}>${icon(ico)}<span>${label}</span></button>`).join('')}</nav><div class="sidebar-bottom"><div class="client-chip"><span class="avatar">O</span><div><strong>${esc(d.profile.name)} 4.0</strong><small>Píšeme to spolu.</small></div></div></div></aside><div class="main-wrap"><header class="topbar"><div class="crumb">${icon('spark')}<strong>${esc(d.profile.name)} 4.0</strong><span>/</span><span>${nav.find(x => x[0] === page)?.[2] || 'Přehled'}</span></div><div class="top-actions"><span class="status ${navigator.onLine ? '' : 'offline'}">${navigator.onLine ? 'Online' : 'Offline'}</span><span class="badge">JEN TVOJE KAPITOLA</span><button class="small-btn" data-action="install">${icon('mobile')}Do mobilu</button></div></header>${draft ? `<div class="editor-bar"><div><strong>Společný zápis s Michalem</strong><small>Pracovní návrh · změny se projeví po nasazení webu.</small></div><div class="editor-bar-actions"><button class="small-btn" data-action="bundle">${icon('upload')}Stáhnout web</button><button class="small-btn" data-action="exit-editor">Hotovo</button></div></div>` : importedPreview ? `<div class="editor-bar"><div>Náhled JSON zálohy<small>Nasazená verze webu zůstává beze změny.</small></div><button class="small-btn" data-action="exit-preview">Zpět na web</button></div>` : ''}${updateReady ? `<div class="update-banner"><span>Je připravená nová verze od Michala.</span><button class="small-btn" data-action="reload">Načíst</button></div>` : ''}<main id="main" tabindex="-1" class="page">${({home: home, train: training, habits, progress, chronicle, settings}[page] || home)(d)}</main><footer class="footer"><span>ITFIT · ${esc(d.profile.name)} 4.0<br>${d.updatedAt ? `Data připravená ${C.format(d.updatedAt.slice(0,10))}` : 'Připraveno ke čtyřicátinám · 2026'}</span><button data-action="${draft ? 'exit-editor' : 'enter-editor'}">${draft ? 'Ukončit společný zápis' : 'Společný zápis s Michalem'} ↗</button></footer></div></div>`;
  }
  function cloudStatus() {
    if (saving) return 'Ukládám online…';
    if (conflict) return 'Je potřeba porovnat verze';
    if (dirty) return navigator.onLine ? 'Čeká na odeslání' : 'Návrh jen v zařízení';
    if (!navigator.onLine) return 'Offline · poslední přehled';
    if (cloudError) return 'Online přehled nedostupný';
    if (!cloudReady) return 'Načítám přehled…';
    return role === 'coach' ? 'Uloženo online' : 'Aktuální přehled';
  }
  function renderCloudUI() {
    if (!cloud) return;
    if (accessDenied) { $('#app').innerHTML = '<main class="access-notice"><p class="eyebrow">SOUKROMÁ NÁSTĚNKA</p><h1>Obnov přihlášení.</h1><p>Tento účet teď nemá ověřený přístup. Online údaje zůstávají soukromé.</p><button class="button primary" data-action="reload">Přihlásit se znovu</button></main>'; return; }
    const status = $('.top-actions .status');
    if (status) { status.textContent = cloudStatus(); status.classList.toggle('pending', dirty || !!cloudError || !cloudReady); }
    const bundleButton = $('[data-action="bundle"]');
    bundleButton?.remove();
    const footer = $('.footer button');
    if (footer) { footer.className='coach-entry'; footer.innerHTML='<span aria-hidden="true">↗</span>'; footer.setAttribute('aria-label',draft ? 'Ukončit společný zápis' : 'Otevřít společný zápis'); }
    if (draft) {
      $('.editor-bar small').textContent = dirty ? 'Návrh je uložený v zařízení. Olda ho uvidí až po potvrzení uložení online.' : 'Zápisy ukládáme online. Stejný přehled načteš na mobilu i počítači.';
      const actions = $('.editor-bar-actions');
      if (dirty) actions.insertAdjacentHTML('afterbegin', `<button class="small-btn" data-action="${conflict ? 'resolve-conflict' : 'save-online'}" ${saving ? 'disabled' : ''}>${conflict ? 'Porovnat verze' : 'Uložit online'}</button>`);
      actions.insertAdjacentHTML('beforeend','<button class="small-btn" data-action="logout-coach">Odhlásit</button>');
    }
    const footerText = $('.footer > span');
    if (footerText && cloudReady) footerText.innerHTML = `ITFIT · ${esc(data().profile.name)} 4.0<br>${published.updatedAt ? `Uloženo online ${esc(new Intl.DateTimeFormat('cs-CZ', {dateStyle:'short',timeStyle:'short'}).format(new Date(published.updatedAt)))}` : 'První skutečné zápisy teprve přidáme'}`;
    if (cloudError || (!cloudReady && navigator.onLine)) $('#main').insertAdjacentHTML('afterbegin', `<div class="notice">${esc(cloudError || 'Načítám společný online přehled.')} ${cloudError ? '<button class="text-link" data-action="refresh-cloud">Zkusit znovu</button>' : ''}</div>`);
    if (cloudConfig.preview) $('#main').insertAdjacentHTML('afterbegin', '<div class="preview-note">Místní ukázka · ukládá na tomto počítači, zatím neposílá na Cloudflare.</div>');
  }
  const originalRender = render;
  render = function () { originalRender(); renderCloudUI(); };
  async function refreshCloud(showMessage = false) {
    if (!cloud || refreshing || saving || !navigator.onLine || $('#modal').open) return;
    refreshing = true;
    try {
      const result = await client.load();
      role = result.role; cloudReady = true; cloudError = ''; accessDenied = false; lastLoaded = new Date();
      published = result.data;
      if (role !== 'coach') { draft = null; dirty = false; conflict = false; }
      if (draft && !dirty) { draft = structuredClone(published); draftBaseRevision = published.revision; persist(); }
      if (draft && dirty && draftBaseRevision !== published.revision) conflict = true;
      render();
      if (showMessage) toast('Aktuální přehled je načtený.');
    } catch (error) {
      cloudError = error.message;
      if ([401,403].includes(error.status)) { role = null; cloudReady = false; draft = null; accessDenied = true; }
      render();
    } finally { refreshing = false; }
  }
  async function sendOnline() {
    if (!cloud || !draft || !dirty || saving || conflict || role !== 'coach' || !cloudReady || !navigator.onLine) return;
    saving = true; cloudError = ''; render();
    try {
      while (draft && dirty) {
        const generation = editGeneration, submitted = structuredClone(draft);
        const result = await client.save(submitted, draftBaseRevision);
        published = result.data; draftBaseRevision = published.revision; lastLoaded = new Date();
        if (generation === editGeneration) { draft = structuredClone(published); dirty = false; }
        else { draft.revision = published.revision; draft.updatedAt = published.updatedAt; }
        persist();
      }
      toast('Uloženo online. Aktuální zápisy jsou dostupné i na dalších zařízeních.');
    } catch (error) {
      conflict = error.status === 409;
      cloudError = conflict ? '' : error.message;
      toast(conflict ? 'Na serveru je novější verze. Tvůj návrh zůstává v zařízení; porovnej verze.' : 'Online uložení nebylo potvrzené. Návrh zůstává v zařízení. Zkus Uložit online znovu.', true);
    } finally { saving = false; render(); }
  }
  function resolveConflict() {
    openModal('Porovnat verze', '<p>Na jiném zařízení už byly uloženy novější údaje. Nejprve si stáhni svůj rozpracovaný návrh. Potom můžeš načíst online verzi a potřebné změny do ní doplnit.</p><div class="backup-actions"><button class="button primary" data-action="export-json">Stáhnout můj návrh</button><button class="button ghost" id="load-server-version">Načíst online verzi</button></div>');
    $('#load-server-version').addEventListener('click', () => askInApp('Použít online verzi?', 'Rozpracovaný návrh v tomto zařízení bude nahrazen online verzí. Nejdřív si ho stáhni jako JSON zálohu.', 'Použít online verzi', async () => {
      try { const result = await client.load(); published = result.data; role = result.role; draft = role === 'coach' ? structuredClone(published) : null; draftBaseRevision = published.revision; dirty = false; conflict = false; cloudError = ''; persist(); closeModal(); render(); }
      catch (error) { toast(error.message, true); }
    }));
  }
  function stat(label, value, sub, ico) { return `<article class="stat"><div class="stat-top">${label}${icon(ico)}</div><strong>${value}</strong><small>${sub}</small></article>`; }
  function cardHead(title, subtitle, extra = '') { return `<div class="card-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${extra}</div>`; }
  function pageHead(kicker, title, subtitle, buttons = '') { return `<div class="page-head"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${subtitle}</p></div>${buttons}</div>`; }
  function home(d) {
    const s = C.stats(d), start = C.effectiveStart(d), series = C.weekSeries(d), recent = [...(d.trainingSessions||d.sessions)].filter(x => x.date <= C.today()).sort((a,b) => b.date.localeCompare(a.date)).slice(0,2);
    if(Number.isInteger(d.completedTogether))s.together=d.completedTogether;
    const activeHabits = d.habits.filter(x => !x.archived);
    return `<section class="hero"><div class="hero-copy"><p class="eyebrow">VŠECHNO NEJLEPŠÍ KE ČTYŘICÍTCE</p><h1>${esc(d.profile.salutation)},<br>tohle je <span>tvoje.</span></h1><p>Tréninky, malé návyky a příběh,<br>který píšeme spolu. Krok za krokem.</p><div class="hero-foot">${icon('flag')}<span>${start ? `Naše nová kapitola od ${C.format(start, true)}` : 'Začneme prvním společným tréninkem'}</span></div></div><div class="forty" aria-hidden="true">40<span>NOVÁ KAPITOLA</span></div></section><div class="stats">${stat('Zapsané tréninky',number(s.sessions),'od začátku naší evidence','train')}${stat('Aktivní týdny',number(s.activeWeeks),'týdny se zapsaným pohybem','habits')}${stat('Minut pohybu',number(s.minutes),'ze zapsaných tréninků','clock')}${stat('Náš začátek',start ? C.format(start,true) : '—',start ? 'první den nové kapitoly' : 'datum nastavíme spolu','flag')}</div><div class="grid"><section class="card">${cardHead('Pravidelnost dělá svoje.','Posledních 12 týdnů · každý čtvereček je jeden den.',`<button class="text-link" data-page="progress">Tvůj pokrok</button>`)}${heatmap(d,series)}<p class="footnote">${start ? 'Svítí dny se zapsaným tréninkem, splněným návykem nebo kroky. Prázdný den znamená bez zápisu.' : 'Zatím prázdná mapa. Vyplní ji tvoje skutečné zápisy, až spolu začneme.'}</p></section><aside class="card gift"><p class="eyebrow">MALÝ DÁREK. VLASTNÍ PŘÍBĚH.</p><h2>Další kapitola<br>patří tobě.</h2><p>${esc(d.profile.dedication)}</p><div class="signature">${esc(d.profile.signature)}<span aria-hidden="true">↗</span></div></aside></div><div class="bottom-grid"><section class="card">${cardHead('Poslední tréninky','Stačí zapsat to podstatné.',draft ? action('session','Zapsat','ghost') : `<button class="text-link" data-page="train">Všechny tréninky</button>`)}${recent.length ? `<div class="list">${recent.map(x => sessionCard(x,false)).join('')}</div>` : empty('První zápis je ještě před námi.','Až spolu odcvičíme první trénink, tady začne naše evidence.','train',draft ? action('session','Zapsat první trénink') : '')}</section><section class="card">${cardHead('Základy, které se opakují.','Návyky vybereme podle toho, co ti sedí.',`<button class="text-link" data-page="habits">Tvoje návyky</button>`)}${activeHabits.length ? activeHabits.map(h => `<div class="plain-stat"><span>${esc(h.name)}</span><strong>${C.habitCount(d,h.id,C.week(C.today()))} / ${h.target} dní tento týden</strong></div>`).join('') : empty('Nejdřív vybereme tvoje základy.','Pár smysluplných návyků. Jejich názvy i četnost domluvíme spolu.','habits',draft ? action('habit','Přidat návyk','ghost') : '')}</section></div><div class="bottom-grid"><section class="card">${cardHead('Tři tréninky spolu.','Součást tvého narozeninového dárku.')}<div class="journey"><div class="journey-num">${Math.min(s.together,3)}<small> / 3</small></div><div><h3>Čas pro tebe a tvůj pohyb.</h3><p>Technika, cviky a plán podle tebe.</p></div></div><div class="three-dots" aria-label="${Math.min(s.together,3)} ze 3 společných tréninků">${[1,2,3].map(n => `<i class="${s.together >= n ? 'done' : ''}"></i>`).join('')}</div><p class="journey-note">${s.together >= 3 ? 'Tři dárkové tréninky máme za sebou. Společná kronika pokračuje dál.' : 'Termíny a první zápis domluvíme spolu. Začátek neurčují narozeniny, ale první skutečný trénink.'}</p></section><section class="card">${cardHead('Tvůj trenér na jednom místě.','Vlastní plán + obsah ITFITu.',`<button class="text-link" data-page="train">Otevřít plán</button>`)}<div class="plan-title"><div class="empty-symbol">${icon('book')}</div><div><h3>${esc(d.plan.title)}</h3><p class="footnote">${d.plan.exercises.length ? `${d.plan.exercises.length} cviků v domluveném plánu` : 'Plán doplníme podle vašich společných tréninků.'}</p></div></div>${d.profile.vaultUrl ? `<a class="button ghost" href="${esc(d.profile.vaultUrl)}" target="_blank" rel="noopener">${icon('link')}Otevřít ITFIT Vault</a>` : '<p class="footnote">Vault máš jako součást dárku napořád. Přesný odkaz sem doplní Michal.</p>'}</section></div>`;
  }
  function heatmap(d, series) {
    const now = C.today(), start = C.effectiveStart(d), days = new Set(d.days.filter(x => x.habits.length || (x.steps ?? 0) > 0).map(x => x.date));
    return `<div class="heatmap" role="img" aria-label="Mapa zapsaného pohybu po dnech">${series.map(w => `<div class="heat-week">${Array.from({length:7},(_,i) => { const dt = C.shift(w.date,i), sessions = d.sessions.filter(x => x.date === dt).length, done = days.has(dt) || sessions; return `<span class="heat-cell ${(!start || dt < start) ? 'before' : ''} ${dt > now ? 'future' : ''} ${done ? 'on' : ''} ${sessions ? 'strong' : ''}" title="${C.format(dt)}: ${sessions ? `${sessions} trénink(y)` : days.has(dt) ? 'zapsaný návyk / kroky' : 'bez zápisu'}"></span>`; }).join('')}</div>`).join('')}</div><div class="heat-legend"><span>Bez zápisu</span><i></i><i style="background:#8aa94c"></i><i></i><span>Trénink</span></div>`;
  }
  function sessionCard(x, full = true) { return `<article class="session"><div class="session-head"><div class="session-icon">${icon(x.category === 'strength' ? 'train' : x.category === 'mobility' ? 'spark' : 'flag')}</div><div class="session-main"><h3>${esc(x.title)}</h3><div class="session-meta"><span>${C.format(x.date,true)}</span><span>${C.categories[x.category]}</span>${x.minutes ? `<span>${x.minutes} min</span>` : ''}${x.together ? '<span>Spolu s Michalem</span>' : ''}</div></div>${editButton('session',x.id,'Upravit trénink')}</div>${full && x.note ? `<p class="session-note">${esc(x.note)}</p>` : ''}${full && x.exercises.length ? `<div class="table-wrap"><table><thead><tr><th>Cvik</th><th>Série × opakování</th><th>Zátěž</th></tr></thead><tbody>${x.exercises.map(e => `<tr><td>${esc(e.name)}</td><td>${e.sets || '—'} × ${e.reps || '—'}</td><td>${e.weight ? `${number(e.weight)} kg` : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}</article>`; }
  function training(d) {
    const sessions = [...d.sessions].filter(x => (sessionFilter === 'all' || x.category === sessionFilter) && `${x.title} ${x.note} ${x.exercises.map(e => e.name).join(' ')}`.toLocaleLowerCase('cs').includes(search.toLocaleLowerCase('cs'))).sort((a,b) => b.date.localeCompare(a.date));
    return `${pageHead('TRÉNINKY A TVŮJ PLÁN','Vlastním tempem.','Co jsi dělal, kdy a jaký z toho byl pocit.',draft ? action('session','Zapsat trénink') : '')}<section class="card">${cardHead('Domluvený plán','Připravuje a upravuje Michal při vašich společných trénincích.',editButton('plan','', 'Upravit plán'))}${d.plan.focus || d.plan.exercises.length || d.plan.notes ? `<h3>${esc(d.plan.title)}</h3>${d.plan.focus ? `<p class="plan-text pre">${esc(d.plan.focus)}</p>` : ''}${d.plan.exercises.length ? `<div class="table-wrap"><table><thead><tr><th>Cvik</th><th>Domluvené provedení</th><th>Poznámka</th></tr></thead><tbody>${d.plan.exercises.map(e => `<tr><td>${esc(e.name)}</td><td>${esc(e.dose)}</td><td>${esc(e.note)}</td></tr>`).join('')}</tbody></table></div>` : ''}${d.plan.notes ? `<p class="plan-text pre">${esc(d.plan.notes)}</p>` : ''}` : empty('Tady bude tvůj vlastní plán.','Vyjdeme z toho, jak cvičíš teď. Spolu doplníme cviky, provedení a poznámky, které se hodí právě tobě.','book',draft ? action('plan','Připravit plán','ghost') : '')}</section><div class="soft-section"><div class="card-head"><div><h2>Tréninkový deník</h2><p>${number(d.sessions.length)} zapsaných tréninků</p></div></div><div class="filter-row">${[['all','Vše'],...Object.entries(C.categories)].map(([id,label]) => `<button data-filter="${id}" class="${sessionFilter === id ? 'active' : ''}">${label}</button>`).join('')}<input id="session-search" type="search" placeholder="Najít trénink nebo cvik…" aria-label="Hledat v trénincích" value="${esc(search)}"></div><div id="session-results" class="list">${sessions.length ? sessions.map(x => sessionCard(x)).join('') : empty(d.sessions.length ? 'Takový zápis tady zatím není.' : 'Tady se potká všechen tvůj pohyb.',d.sessions.length ? 'Zkus změnit filtr nebo hledaný výraz.' : 'Síla, mobilita, kondice i výlet. Zápisy přibudou, až je spolu projdeme.','train')}</div></div>`;
  }
  function habits(d) {
    const current = C.week(C.today()), active = d.habits.filter(h => !h.archived), archived = d.habits.filter(h => h.archived), lastDays = [...d.days].sort((a,b) => b.date.localeCompare(a.date)).slice(0,20);
    return `${pageHead('NÁVYKY A MALÉ KROKY','Základy na dlouho.','Sledujeme to, co spolu domluvíme. Bez zbytečných drobností.',draft ? `<div class="backup-actions">${action('habit','Nový návyk','ghost')}${action('day','Zapsat den')}</div>` : '')}${!active.length ? empty('Které návyky budou tvoje?','Názvy a týdenní cíle vybereme při společném startu. Tady potom uvidíš splněné dny a dlouhodobou pravidelnost.','habits') : `<div class="habits-grid">${active.map(h => `<article class="habit"><div class="habit-head"><div><h3>${esc(h.name)}</h3><p>${esc(h.note) || `Domluvený cíl: ${h.target} dní v týdnu.`}</p></div>${editButton('habit',h.id,'Upravit návyk')}</div><div class="habit-total">${C.habitCount(d,h.id)}<span>splněných dní celkem</span></div><div class="week-days">${['Po','Út','St','Čt','Pá','So','Ne'].map((label,i) => { const day = C.shift(current,i), done = d.days.some(x => x.date === day && x.habits.includes(h.id)); return `<div class="day-circle ${done ? 'done' : ''}" title="${C.format(day)}"><i>${done ? '✓' : '·'}</i>${label}</div>`; }).join('')}</div><div class="habit-foot"><span>${C.habitCount(d,h.id,current)} / ${h.target} dní tento týden</span><span>Nejdelší série: ${C.longestStreak(d,h.id)} dní</span></div></article>`).join('')}</div>`}<section class="card soft-section">${cardHead('Denní zápisy','Návyky, volitelně kroky, energie a krátká poznámka.')}<p class="footnote" style="margin:0 0 15px">Nezapsaný den znamená, že nemáme údaj. Nevyhodnocujeme ho jako nesplněný návyk.</p>${lastDays.length ? lastDays.map(x => `<article class="note-row"><div class="row-action"><time>${C.format(x.date)}</time>${editButton('day',x.date,'Upravit den')}</div><div class="meta">${x.habits.map(id => esc(d.habits.find(h => h.id === id)?.name)).join(' · ') || 'Bez označených návyků'}${x.steps !== null ? ` · ${number(x.steps)} kroků` : ''}${x.energy !== null ? ` · Energie ${x.energy}/5` : ''}</div>${x.note ? `<p>${esc(x.note)}</p>` : ''}</article>`).join('') : '<p class="empty-note">První denní zápis vznikne spolu s vámi.</p>'}</section>${archived.length ? `<section class="card soft-section">${cardHead('Dřívější návyky','Historie zůstává součástí statistik.')}<div class="list">${archived.map(h => `<div class="row-action"><span>${esc(h.name)} · ${C.habitCount(d,h.id)} dní</span>${editButton('habit',h.id)}</div>`).join('')}</div></section>` : ''}`;
  }
  function chart(series, key = 'sessions') {
    const max = Math.max(1,...series.map(x => x[key])), width = 620, height = 175, left = 25, span = 570 / series.length;
    return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${key === 'sessions' ? 'Počet tréninků' : 'Aktivní dny'} po týdnech"><line class="axis" x1="25" y1="140" x2="600" y2="140"/>${series.map((x,i) => {const h = x[key] / max * 103; return `<rect class="${x[key] ? 'bar' : 'quiet'}" x="${left+i*span+7}" y="${140-Math.max(h,2)}" width="${Math.max(5,span-14)}" height="${Math.max(h,2)}" rx="3"><title>${C.format(x.date,true)}: ${x[key]}</title></rect>${x[key] ? `<text x="${left+i*span+span/2}" y="${129-h}" text-anchor="middle">${x[key]}</text>` : ''}${i % (series.length > 8 ? 3 : 1) === 0 ? `<text x="${left+i*span+span/2}" y="162" text-anchor="middle">${C.format(x.date,true)}</text>` : ''}`; }).join('')}</svg>`;
  }
  function progress(d) {
    const now = C.today(), from = period === 'all' ? '' : C.shift(now,-Number(period)+1), s = C.stats(d,from), series = C.weekSeries(d,12);
    const start = C.effectiveStart(d), months = new Map(), exerciseStats = new Map();
    [...d.sessions.map(x => x.date),...d.days.map(x => x.date)].filter(dt => dt >= from && dt <= now).forEach(dt => months.set(dt.slice(0,7),true));
    d.sessions.filter(x => x.date >= from && x.date <= now).forEach(x => { const counted = new Set(); x.exercises.forEach(e => { const key = e.name.trim().toLocaleLowerCase('cs'), old = exerciseStats.get(key) || {name:e.name,count:0,weight:0,last:''}; if (!counted.has(key)) old.count++; counted.add(key); old.weight = Math.max(old.weight,e.weight); old.last = old.last > x.date ? old.last : x.date; exerciseStats.set(key,old); }); });
    return `${pageHead('DLOUHODOBÝ POKROK','Vidět, co se opakuje.','Pravidelnost a skutečné zápisy. Každý údaj má svůj příběh.')}<div class="filter-row">${[['all','Celá historie'],['90','Posledních 90 dní'],['365','Poslední rok']].map(([id,label]) => `<button data-period="${id}" class="${period === id ? 'active' : ''}">${label}</button>`).join('')}</div><div class="stats">${stat('Tréninky',number(s.sessions),'ve vybraném období','train')}${stat('Aktivní dny',number(s.activeDays),'trénink, návyk nebo kroky','habits')}${stat('Čas v pohybu',number(s.minutes)+' min','ze zapsaných tréninků','clock')}${stat('Aktivní týdny',number(s.activeWeeks),'ve vybraném období','chart')}</div>${!start ? '<div class="notice">Statistiky začnou růst od prvního skutečného zápisu. Narozeniny nejsou automatický začátek evidence.</div>' : ''}<div class="grid"><section class="card">${cardHead('Tréninky po týdnech','Posledních 12 týdnů · jeden sloupec, jeden týden.')}${chart(series)}${!d.sessions.length ? '<p class="chart-empty">První sloupec začne růst s vaším prvním tréninkem.</p>' : ''}</section><section class="card">${cardHead('Návyky v čase','Splněné dny ve vybraném období.')}${d.habits.length ? d.habits.map(h => `<div class="plain-stat"><span>${esc(h.name)}${h.archived ? ' · dřívější' : ''}</span><strong>${daysText(C.habitCount(d,h.id,from))}</strong></div>`).join('') : '<p class="empty-note">Nejdřív spolu vybereme návyky, které chceš sledovat.</p>'}<p class="footnote">U návyků počítáme označené dny. Chybějící zápis neznamená neúspěch.</p></section></div><section class="card month-summary">${cardHead('Měsíc po měsíci','Dlouhodobý přehled vašich zápisů.')}${months.size ? `<div class="table-wrap"><table><thead><tr><th>Měsíc</th><th>Tréninky</th><th>Aktivní dny</th><th>Minuty</th></tr></thead><tbody>${[...months.keys()].sort().reverse().map(m => { const st = C.stats(d,m+'-01' < from ? from : m+'-01', C.shift(C.shift(m+'-01',32).slice(0,7)+'-01',-1) < now ? C.shift(C.shift(m+'-01',32).slice(0,7)+'-01',-1) : now); return `<tr><td>${new Intl.DateTimeFormat('cs-CZ',{month:'long',year:'numeric',timeZone:'UTC'}).format(C.date(m+'-01'))}</td><td>${st.sessions}</td><td>${st.activeDays}</td><td>${number(st.minutes)}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="empty-note">Tady budou jednotlivé měsíce, až spolu začnete zapisovat.</p>'}</section><section class="card soft-section">${cardHead('Cviky, které se vracejí.','Frekvence a nejvyšší zapsaná zátěž ve vybraném období.')}${exerciseStats.size ? `<div class="table-wrap"><table><thead><tr><th>Cvik</th><th>Tréninků s cvikem</th><th>Nejvyšší zapsaná váha</th><th>Naposledy</th></tr></thead><tbody>${[...exerciseStats.values()].sort((a,b)=>b.count-a.count).map(e=>`<tr><td>${esc(e.name)}</td><td>${e.count}</td><td>${e.weight ? number(e.weight)+' kg' : '—'}</td><td>${C.format(e.last,true)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty-note">Cviky jsou v zápisu volitelné. Jakmile je přidáte, objeví se jejich dlouhodobý přehled.</p>'}<p class="footnote">Vyšší váha sama o sobě neříká vše o pokroku. Kontext zůstává v poznámkách k tréninku.</p></section><div class="bottom-grid"><section class="card">${cardHead('Mapa pravidelnosti','Posledních 12 týdnů.')}${heatmap(d,series)}</section><section class="card">${cardHead('Kroky, když je zapíšeme.','Jen dny s uloženým údajem.')}<div class="plain-stat"><span>Kroky ve vybraném období</span><strong>${number(s.steps)}</strong></div><div class="plain-stat"><span>Dní se zapsanými kroky</span><strong>${s.stepsDays}</strong></div><div class="plain-stat"><span>Průměr z těchto dní</span><strong>${s.stepsDays ? number(Math.round(s.steps/s.stepsDays)) : '—'}</strong></div></section></div>`;
  }
  function chronicle(d) {
    const first = [...d.sessions].sort((a,b)=>a.date.localeCompare(b.date))[0];
    const moments = [{date:d.profile.birthday,title:'Olda 4.0. Nová kapitola.',note:d.profile.dedication,label:`Ke čtyřicátinám · ${d.profile.signature}`,id:''}, ...d.milestones.map(x => ({...x,label:'Náš společný milník'})), ...(first ? [{date:first.date,title:'První trénink v naší kronice.',note:first.title+(first.note ? '\n'+first.note : ''),label:'Začátek skutečných zápisů',id:''}] : [])].sort((a,b)=>b.date.localeCompare(a.date));
    return `${pageHead('FITNESS KRONIKA','Není to jen o číslech.','Společné tréninky, první pokroky a okamžiky, které chceme uchovat.',draft ? action('milestone','Přidat milník') : '')}<div class="timeline">${moments.map(m=>`<article class="moment"><time datetime="${m.date}">${C.format(m.date)}</time><h3>${esc(m.title)}</h3><p>${esc(m.note)}</p><span class="moment-label">${esc(m.label)}</span>${m.id ? editButton('milestone',m.id,'Upravit milník') : ''}</article>`).join('')}</div>${!first ? empty('První společný trénink teprve přidáme.','A s ním přijde i první skutečný zápis do kroniky. Start si určíte spolu.','flag') : ''}`;
  }
  function settings(d) {
    if (cloud) return cloudSettings(d);
    return `${pageHead('ZÁZEMÍ TVOJÍ APPKY','Tvoje. I bez internetu.','Zápisy děláme spolu. Doma je máš přehledně po ruce.')}<div class="grid"><section class="card">${cardHead('Naše společná rutina','Tři jednoduché kroky.')}<div class="step-list"><div class="step"><span>1</span><div><strong>Projdeme to spolu.</strong><p>Co jsi odcvičil, které návyky se dařily a co stojí za poznámku. Stačí základ.</p></div></div><div class="step"><span>2</span><div><strong>Michal doplní tvoji kroniku.</strong><p>Přidá zápisy, upraví plán a nasadí aktuální verzi webu.</p></div></div><div class="step"><span>3</span><div><strong>Ty máš svůj přehled.</strong><p>Online načteš aktualizaci, offline vidíš poslední staženou verzi. Co budeš chtít doplnit, napiš Michalovi nebo si to poznamenej na příště.</p></div></div></div></section><section class="card">${cardHead('Přidej si Oldu 4.0 do mobilu.','Vlastní ikona, celé okno a přehled i offline.')}${action('install','Přidat appku do mobilu','primary','mobile')}<div class="install-info"><strong>iPhone / iPad</strong>V Safari otevři sdílení → Přidat na plochu.<br><br><strong>Android</strong>V Chrome otevři menu → Instalovat aplikaci nebo Přidat na plochu.</div><p class="footnote">První otevření potřebuje internet. Potom appka uchová poslední načtený web. Novou verzi načteš při dalším online otevření.</p></section></div><div class="bottom-grid"><section class="card">${cardHead('Záloha a přenos.','JSON uchová zápisy, návyky, plán i milníky.')}<div class="backup-actions">${action('export-json','Stáhnout JSON','ghost','download')}${action('import-json','Otevřít zálohu','ghost','upload')}</div><p class="footnote">${draft ? 'Import po potvrzení nahradí jen pracovní návrh. Nasazený web se změní až po novém nasazení.' : 'Otevřená záloha slouží pouze jako náhled. Pro běžné prohlížení stačí tento web.'}</p>${draft ? `<div class="backup-actions">${action('bundle','Stáhnout web pro Cloudflare','primary','upload')}</div><p class="footnote">Balíček ZIP obsahuje aktuální data a všechny soubory pro offline appku. Po nasazení ho Olda uvidí online.</p>` : ''}</section><section class="card">${cardHead('Osobní nastavení','Oslovení, začátek evidence a obsah od Michala.',editButton('profile','', 'Upravit profil'))}<div class="plain-stat"><span>Pro koho</span><strong>${esc(d.profile.name)}</strong></div><div class="plain-stat"><span>Začátek naší evidence</span><strong>${d.profile.startDate ? C.format(d.profile.startDate,true) : C.effectiveStart(d) ? C.format(C.effectiveStart(d),true) : 'Až spolu začneme'}</strong></div><div class="plain-stat"><span>Režim</span><strong>${draft ? 'Společný zápis' : 'Prohlížení'}</strong></div>${d.profile.vaultUrl ? `<div class="backup-actions"><a class="button ghost" href="${esc(d.profile.vaultUrl)}" target="_blank" rel="noopener">${icon('link')}Otevřít Vault</a></div>` : '<p class="footnote">Odkaz na ITFIT Vault doplní Michal.</p>'}</section></div>`;
  }
  function field(label, name, value = '', type = 'text', attrs = '', full = false, hint = '') { return `<div class="field ${full ? 'full' : ''}"><label for="f-${name}">${label}</label>${type === 'textarea' ? `<textarea id="f-${name}" name="${name}" maxlength="4000" ${attrs}>${esc(value)}</textarea>` : `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${attrs}>`}${hint ? `<small>${hint}</small>` : ''}</div>`; }
  const selector = (label,name,value,options) => `<div class="field"><label for="f-${name}">${label}</label><select name="${name}" id="f-${name}">${options.map(([id,text])=>`<option value="${esc(id)}" ${String(value)===String(id)?'selected':''}>${text}</option>`).join('')}</select></div>`;
  const formEnd = (remove = '') => `<p class="inline-error" id="form-error" role="alert"></p><div class="form-actions">${remove ? `<button type="button" class="button danger" data-action="delete-record" data-kind="${remove.split(':')[0]}" data-id="${esc(remove.slice(remove.indexOf(':')+1))}">Smazat zápis</button>` : ''}<button type="button" class="button ghost" data-action="close">Zrušit</button><button type="submit" class="button primary">Uložit zápis</button></div></form>`;
  function formSession(id = '') {
    if (!draft) return;
    const x = draft.sessions.find(x=>x.id===id) || {date:C.today(),title:'',category:'strength',minutes:0,together:true,note:'',exercises:[]};
    openModal(id?'Upravit trénink':'Společný zápis tréninku',`<p>Zapište to podstatné. Cviky, série i zátěž jsou volitelné.</p><form id="record-form" data-kind="session" data-id="${esc(id)}"><div class="form-grid">${field('Datum','date',x.date,'date',`required max="${C.today()}"`)}${selector('Typ pohybu','category',x.category,Object.entries(C.categories))}${field('Název tréninku','title',x.title,'text','required maxlength="160" placeholder="Jak ho chcete pojmenovat?"',true)}${field('Délka (minuty, volitelně)','minutes',x.minutes||'','number','min="0" max="1440" step="1"')}<label class="checkbox"><input type="checkbox" name="together" ${x.together?'checked':''}>Spolu s Michalem</label>${field('Jak to šlo / co si zapamatovat','note',x.note,'textarea','',true)}</div><div class="form-section"><h3>Cviky · pokud je chcete evidovat</h3><div class="exercise-labels"><span>Cvik</span><span>Série</span><span>Opak.</span><span>kg</span><span></span></div><div id="exercise-rows">${x.exercises.map(e=>exerciseRow(e)).join('')}</div><button type="button" class="small-btn" data-action="add-exercise">${icon('plus')}Přidat cvik</button></div>${formEnd(id?'session:'+id:'')}`);
  }
  function exerciseRow(e = {}) { return `<div class="exercise-inputs"><input name="ex-name" aria-label="Název cviku" required maxlength="120" value="${esc(e.name||'')}" placeholder="Cvik"><input name="ex-sets" aria-label="Série" type="number" min="0" max="100" step="1" value="${e.sets||''}"><input name="ex-reps" aria-label="Opakování" type="number" min="0" max="10000" step="1" value="${e.reps||''}"><input name="ex-weight" aria-label="Zátěž v kilogramech" type="number" min="0" max="1500" step="0.25" value="${e.weight||''}"><button type="button" class="icon-btn" data-action="remove-row" aria-label="Odebrat cvik">${icon('close')}</button></div>`; }
  function formDay(id = '') {
    if (!draft) return;
    const dt = id || C.today(), x = draft.days.find(x=>x.date===dt) || {date:dt,habits:[],steps:null,energy:null,note:''};
    openModal('Společný zápis dne',`<p>Označte jen to, co opravdu víte. Nevyplněné kroky a energie zůstanou bez údaje.</p><form id="record-form" data-kind="day"><div class="form-grid">${field('Datum','date',x.date,'date',`required max="${C.today()}"`)}${selector('Energie · volitelně','energy',x.energy??'',[['','Bez údaje'],['1','1 / 5'],['2','2 / 5'],['3','3 / 5'],['4','4 / 5'],['5','5 / 5']])}${field('Kroky · volitelně','steps',x.steps??'','number','min="0" max="150000" step="1"',true)}<div class="field full"><label>Splněné návyky</label>${draft.habits.filter(h=>!h.archived||x.habits.includes(h.id)).map(h=>`<label class="checkbox"><input type="checkbox" name="habit" value="${esc(h.id)}" ${x.habits.includes(h.id)?'checked':''}>${esc(h.name)}${h.archived?' <small>(dřívější)</small>':''}</label>`).join('')||'<p class="footnote">Zatím nemáte vybraný žádný návyk. Přidejte ho v přehledu návyků.</p>'}</div>${field('Poznámka ke dni','note',x.note,'textarea','',true)}</div>${formEnd(draft.days.some(x=>x.date===dt)?'day:'+dt:'')}`);
    $('#f-date').addEventListener('change',e=> { if (C.validDate(e.target.value)) formDay(e.target.value); });
  }
  function formHabit(id = '') {
    if (!draft) return;
    const h = draft.habits.find(x=>x.id===id)||{name:'',target:3,note:'',archived:false};
    openModal(id?'Upravit návyk':'Vybrat nový návyk',`<p>Návyk a týdenní četnost domluvte spolu. Při změně jeho významu založte nový, aby historie zůstala srozumitelná.</p><form id="record-form" data-kind="habit" data-id="${esc(id)}"><div class="form-grid">${field('Název návyku','name',h.name,'text','required maxlength="100"',true)}${selector('Domluvený cíl · dní týdně','target',h.target,[1,2,3,4,5,6,7].map(n=>[n,`${n} ${n===1?'den':n<5?'dny':'dní'}`]))}${id?`<label class="checkbox"><input name="archived" type="checkbox" ${h.archived?'checked':''}>Dřívější návyk <small>(uchovat historii)</small></label>`:''}${field('Krátká poznámka','note',h.note,'text','maxlength="500"',true)}</div>${formEnd()}`);
  }
  function formMilestone(id = '') {
    if (!draft) return;
    const x = draft.milestones.find(x=>x.id===id)||{date:C.today(),title:'',note:''};
    openModal(id?'Upravit milník':'Přidat okamžik do kroniky',`<p>První pokrok, společný zážitek nebo něco, co stálo za to.</p><form id="record-form" data-kind="milestone" data-id="${esc(id)}"><div class="form-grid">${field('Datum','date',x.date,'date',`required max="${C.today()}"`)}${field('Název milníku','title',x.title,'text','required maxlength="160"',true)}${field('Co se povedlo / co si zapamatovat','note',x.note,'textarea','',true)}</div>${formEnd(id?'milestone:'+id:'')}`);
  }
  function planRow(e={}) { return `<div class="exercise-inputs plan-row"><input name="plan-name" aria-label="Cvik v plánu" required maxlength="120" value="${esc(e.name||'')}" placeholder="Cvik"><input name="plan-dose" aria-label="Domluvené provedení" maxlength="120" value="${esc(e.dose||'')}" placeholder="Provedení"><input class="plan-note" name="plan-note" aria-label="Pokyn ke cviku" maxlength="1000" value="${esc(e.note||'')}" placeholder="Pokyn / poznámka"><button type="button" class="icon-btn" data-action="remove-row" aria-label="Odebrat cvik z plánu">${icon('close')}</button></div>`; }
  function formPlan() {
    if (!draft) return;
    const p=draft.plan;
    openModal('Oldův vlastní plán',`<p>Plán je vaše domluva. Bez automaticky předepsaných cviků.</p><form id="record-form" data-kind="plan"><div class="form-grid">${field('Název plánu','title',p.title,'text','required maxlength="160"',true)}${field('Na co se teď soustředíme','focus',p.focus,'textarea','',true)}</div><div class="form-section"><h3>Cviky a provedení</h3><div class="exercise-labels plan-labels"><span>Cvik</span><span>Provedení</span><span>Pokyn / poznámka</span><span></span></div><div id="plan-rows">${p.exercises.map(planRow).join('')}</div><button type="button" class="small-btn" data-action="add-plan-row">${icon('plus')}Přidat cvik</button></div><div class="form-grid">${field('Poznámky k plánu','notes',p.notes,'textarea','',true)}</div>${formEnd()}`);
  }
  function formProfile() {
    if (!draft) return;
    const p=draft.profile;
    openModal('Osobní nastavení',`<form id="record-form" data-kind="profile"><div class="form-grid">${field('Jméno','name',p.name,'text','required maxlength="80"')}${field('Oslovení','salutation',p.salutation,'text','required maxlength="80"')}${field('Začátek naší evidence · až začne','startDate',p.startDate,'date',`max="${C.today()}"`,true,'Nechte prázdné, dokud nezačnete. Jinak se použije datum prvního skutečného zápisu.')}${field('Osobní věnování','dedication',p.dedication,'textarea','',true)}${field('Podpis','signature',p.signature,'text','maxlength="160"',true)}${field('Přesný odkaz na ITFIT Vault','vaultUrl',p.vaultUrl,'url','maxlength="500" placeholder="https://…"',true)}</div>${formEnd()}`);
  }
  function saveForm(form) {
    if(!draft)return;
    const f=new FormData(form), next=JSON.parse(JSON.stringify(draft)), kind=form.dataset.kind, id=form.dataset.id||'', str=n=>String(f.get(n)||'').trim(), num=n=>Number(f.get(n)||0), replace=(arr,x)=>{const i=arr.findIndex(v=>v.id===x.id);if(i<0)arr.push(x);else arr[i]=x;};
    if(['session','day','milestone'].includes(kind) && str('date')>C.today())throw new Error('Zapisujeme hotové dny. Budoucí datum ještě nepatří do evidence.');
    if(kind==='session') {const exercises=[...form.querySelectorAll('.exercise-inputs')].map(r=>({name:r.querySelector('[name=ex-name]').value.trim(),sets:Number(r.querySelector('[name=ex-sets]').value||0),reps:Number(r.querySelector('[name=ex-reps]').value||0),weight:Number(r.querySelector('[name=ex-weight]').value||0)}));replace(next.sessions,{id:id||crypto.randomUUID(),date:str('date'),title:str('title'),category:str('category'),minutes:num('minutes'),together:f.has('together'),note:str('note'),exercises});}
    if(kind==='day') {const x={date:str('date'),habits:f.getAll('habit').map(String),steps:str('steps')===''?null:num('steps'),energy:str('energy')===''?null:num('energy'),note:str('note')};const i=next.days.findIndex(v=>v.date===x.date);if(i<0)next.days.push(x);else next.days[i]=x;}
    if(kind==='habit')replace(next.habits,{id:id||crypto.randomUUID(),name:str('name'),note:str('note'),target:num('target'),archived:f.has('archived')});
    if(kind==='milestone')replace(next.milestones,{id:id||crypto.randomUUID(),date:str('date'),title:str('title'),note:str('note')});
    if(kind==='plan')next.plan={title:str('title'),focus:str('focus'),notes:str('notes'),exercises:[...form.querySelectorAll('.plan-row')].map(r=>({name:r.querySelector('[name=plan-name]').value.trim(),dose:r.querySelector('[name=plan-dose]').value.trim(),note:r.querySelector('[name=plan-note]').value.trim()}))};
    if(kind==='profile'){if(str('startDate')>C.today())throw new Error('Začátek evidence nastavte až na skutečný den.');next.profile={...next.profile,name:str('name'),salutation:str('salutation'),startDate:str('startDate'),dedication:str('dedication'),signature:str('signature'),vaultUrl:str('vaultUrl')};}
    commit(next);
  }
  function cloudSettings(d) {
    return `${pageHead('ZÁZEMÍ TVOJÍ APPKY','Jeden společný přehled.','Zápisy připravuje Michal. Online jsou stejné na mobilu i počítači.')}<div class="grid"><section class="card">${cardHead('Jak to spolu funguje','Po zápisu není potřeba nasazovat web.')}<div class="step-list"><div class="step"><span>1</span><div><strong>Projdeme uplynulé dny.</strong><p>Zapisujeme pouze to, co spolu potvrdíme. Neznámé údaje necháme prázdné.</p></div></div><div class="step"><span>2</span><div><strong>Michal uloží zápis online.</strong><p>Počkej na potvrzení „Uloženo online“. Při výpadku zůstane návrh v jeho zařízení.</p></div></div><div class="step"><span>3</span><div><strong>Olda si otevře svůj přehled.</strong><p>Po načtení vidí aktuální zápisy a statistiky. Otevřený přehled se průběžně obnovuje; offline zůstává poslední načtená verze.</p></div></div></div><div class="backup-actions">${action('refresh-cloud','Obnovit přehled','ghost','arrow')}</div><p class="footnote">${lastLoaded ? `Naposledy načteno ${esc(lastLoaded.toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'}))}.` : 'Čekáme na načtení online přehledu.'}</p></section><section class="card">${cardHead('Olda 4.0 v mobilu','Vlastní ikona a poslední přehled i bez internetu.')}${action('install','Přidat appku do mobilu','primary','mobile')}<div class="install-info"><strong>iPhone / iPad</strong>Safari → Sdílet → Přidat na plochu.<br><br><strong>Android</strong>Chrome → Menu → Instalovat aplikaci.</div><p class="footnote">První otevření a nové údaje potřebují internet. Offline kopie zůstává v tomto zařízení.</p></section></div><div class="bottom-grid"><section class="card">${cardHead('JSON záloha','Pro uchování nebo přenos údajů.')}<div class="backup-actions">${action('export-json',draft ? 'Stáhnout můj návrh' : 'Stáhnout zálohu','ghost','download')}${role==='coach' ? action('import-json','Otevřít JSON zálohu','ghost','upload') : ''}</div><p class="footnote">${draft ? 'Import po potvrzení nahradí celý společný přehled a odešle jej online. Předtím si stáhni současnou zálohu.' : 'Stažená záloha nic nemění. Pro běžné používání není potřeba stahovat web ani soubory.'}</p></section><section class="card">${cardHead('Osobní nastavení','Začátek evidence a obsah od Michala.',editButton('profile','', 'Upravit profil'))}<div class="plain-stat"><span>Pro koho</span><strong>${esc(d.profile.name)}</strong></div><div class="plain-stat"><span>Začátek evidence</span><strong>${d.profile.startDate ? C.format(d.profile.startDate,true) : C.effectiveStart(d) ? C.format(C.effectiveStart(d),true) : 'Až spolu začneme'}</strong></div><div class="plain-stat"><span>Přístup</span><strong>${role==='coach' ? 'Michal · společný zápis' : 'Prohlížení'}</strong></div>${d.profile.vaultUrl ? `<div class="backup-actions"><a class="button ghost" href="${esc(d.profile.vaultUrl)}" target="_blank" rel="noopener">${icon('link')}Otevřít Vault</a></div>` : '<p class="footnote">Vybranou mobilitu a atlas připojíme po domluvě.</p>'}</section></div>`;
  }
  function openCoachLogin() {
    openModal('Zápis pro Michala', '<p>Prohlížení funguje přes odkaz. Zápisy může upravovat pouze Michal po přihlášení.</p><form id="coach-login-form"><div class="field"><label for="coach-key">Heslo pro zápis</label><input id="coach-key" name="key" type="password" required maxlength="256" autocomplete="current-password"></div><p class="inline-error" id="login-error" role="alert"></p><div class="form-actions"><button class="button ghost" type="button" data-action="close">Zrušit</button><button class="button primary" type="submit">Přihlásit a zapisovat</button></div></form>');
  }
  async function submitCoachLogin(form) {
    const button=form.querySelector('[type=submit]');button.disabled=true;
    try {
      await client.authenticate(form.querySelector('[name=key]').value);
      form.querySelector('[name=key]').value='';
      const result=await client.load();if(result.role!=='coach')throw new Error('Server nepotvrdil přihlášení.');
      role='coach';cloudReady=true;accessDenied=false;cloudError='';published=result.data;lastLoaded=new Date();closeModal();enterCloudEditor();
    } catch(error) { form.querySelector('#login-error').textContent=error.message; }
    finally { if(button.isConnected)button.disabled=false; }
  }
  async function logoutCoach() {
    if(saving){toast('Počkej na dokončení uložení.');return;}
    try{await client.logout();draft=null;dirty=false;conflict=false;role='viewer';render();await refreshCloud();toast('Zápis je odhlášený. Prohlížení zůstává dostupné.');}catch(error){toast(error.message,true);}
  }
  function enterCloudEditor() {
    if (role !== 'coach') { openCoachLogin(); return; }
    let saved = null;
    try { const value = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (value?.data && value.pending) saved = {...value,data:C.validate(value.data)}; } catch { toast('Místní návrh nelze přečíst. Online údaje zůstávají zachované.',true); }
    const begin = useSaved => {
      draft = structuredClone(useSaved && saved ? saved.data : published);
      draftBaseRevision = useSaved && saved ? saved.baseRevision : published.revision;
      dirty = !!(useSaved && saved); conflict = dirty && draftBaseRevision !== published.revision;
      importedPreview = null; cloudError = ''; editGeneration++; closeModal(); persist(); render();
    };
    if (!saved) { begin(false); return; }
    openModal('Neodeslaný návrh v tomto zařízení', `<p>Tady zůstaly rozpracované zápisy, jejichž online uložení nebylo potvrzené. Na serveru je zatím poslední uložená verze.</p><div class="import-review">${saved.data.sessions.length} tréninků · ${saved.data.days.length} denních zápisů${saved.baseRevision!==published.revision?'<br>Online verze se mezitím změnila. Návrhy bude potřeba porovnat.':''}</div><div class="backup-actions"><button class="button primary" id="continue-cloud-draft">Pokračovat v návrhu</button><button class="button ghost" id="use-cloud-data">Použít online přehled</button></div>`);
    $('#continue-cloud-draft').addEventListener('click',()=>begin(true));
    $('#use-cloud-data').addEventListener('click',()=>{openModal('Použít online přehled?', '<p>Neodeslaný návrh si nejdřív stáhni jako zálohu. Potom jej můžeš v tomto zařízení nahradit online verzí.</p><div class="backup-actions"><button class="button ghost" id="backup-pending">Stáhnout neodeslaný návrh</button><button class="button primary" id="discard-pending">Použít online přehled</button></div>');$('#backup-pending').addEventListener('click',()=>download(`olda-neodeslany-navrh-${C.today()}.json`,JSON.stringify(saved.data,null,2),'application/json'));$('#discard-pending').addEventListener('click',()=>begin(false));});
  }
  function enterEditor() {
    if (cloud) { enterCloudEditor(); return; }
    let saved=null;
    try {saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved)saved.data=C.validate(saved.data);} catch {toast('Uložený návrh se nepodařilo přečíst. Začínáme z nasazených dat.',true);}
    const choose=(useDraft)=>{draft=useDraft&&saved?saved.data:JSON.parse(JSON.stringify(published));importedPreview=null;closeModal();render();persist();};
    openModal('Společný zápis s Michalem',`<p>Tohle je pracovní režim pro vaše společné zápisy. Návrh se uchová v tomto prohlížeči. Doma Olda uvidí změny po nasazení nového balíčku.</p>${saved?`<div class="import-review">V prohlížeči je uložený návrh: ${saved.data.sessions.length} tréninků, ${saved.data.days.length} denních zápisů.${saved.baseRevision!==published.revision?'<br><strong>Nasazený web má jinou verzi. Zvolte, ze kterých dat chcete pokračovat.</strong>':''}</div>`:''}<div class="backup-actions"><button class="button primary" id="editor-start">${saved?'Pokračovat v uloženém návrhu':'Začít společný zápis'}</button>${saved?'<button class="button ghost" id="editor-published">Použít data z tohoto webu</button>':''}</div><p class="footnote">Změny tady neupravují server. Tento režim slouží k přípravě nové verze.</p>`);
    $('#editor-start').addEventListener('click',()=>choose(!!saved));
    $('#editor-published')?.addEventListener('click',()=>askInApp('Použít nasazená data?', 'Uložený pracovní návrh bude nahrazen daty z tohoto webu. Pokud si ho chceš uchovat, vrať se do návrhu a nejdřív stáhni jeho JSON zálohu.', 'Ano, použít data webu', ()=>choose(false)));
  }
  function download(name,content,type) {const url=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);}
  function exportJSON() {download(`olda-4-0-zaloha-${C.today()}.json`,JSON.stringify(data(),null,2),'application/json');toast('JSON záloha je stažená.');}
  function importJSON() {
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.addEventListener('change',async()=>{
      const file=input.files[0];if(!file)return;
      if(cloud&&file.size>2*1024*1024){toast('Online záloha může mít nejvýše 2 MB.',true);return;}
      try{if(file.size>10*1024*1024)throw new Error('Záloha je moc velká (maximum 10 MB).');const parsed=C.validate(JSON.parse(await file.text()));openModal('Otevřít JSON zálohu',`<p>${draft?'Po potvrzení nahradíme pracovní návrh. Předtím si můžeš stáhnout jeho současnou zálohu.':'Otevřeme jen náhled. Nasazená data a uložený návrh zůstanou beze změny.'}</p><div class="import-review">${esc(parsed.profile.name)} · ${parsed.sessions.length} tréninků · ${parsed.days.length} dní · ${parsed.habits.length} návyků · ${parsed.milestones.length} milníků</div><div class="backup-actions">${draft?action('export-json','Zálohovat současný návrh','ghost','download'):''}<button class="button primary" id="confirm-import">${draft?'Nahradit pracovní návrh':'Otevřít náhled'}</button></div>`);$('#confirm-import').addEventListener('click',()=>{if(draft)commit(parsed);else{importedPreview=parsed;closeModal();render();toast('Prohlížíš JSON zálohu.');}});}catch(e){toast(e.message==='Unexpected token'? 'Soubor není platný JSON.':e.message,true);}
    });input.click();
  }
  function crc32(bytes) {let crc=0xffffffff;for(const b of bytes){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
  function zip(files) {
    const enc=new TextEncoder(),chunks=[],central=[];let offset=0;
    const header=(length)=>{const a=new Uint8Array(length);return[a,new DataView(a.buffer)];};
    for(const[name,bytes]of files){const n=enc.encode(name),crc=crc32(bytes),[local,v]=header(30+n.length);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,n.length,true);local.set(n,30);chunks.push(local,bytes);const[c,cv]=header(46+n.length);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);central.push(c);offset+=local.length+bytes.length;}
    const size=central.reduce((n,x)=>n+x.length,0),[end,e]=header(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});
  }
  function snapshotHTML(snapshot) {
    const doc=document.documentElement.cloneNode(true);doc.querySelector('#itfit-data').textContent=json(snapshot);doc.querySelector('#app').innerHTML='';const modal=doc.querySelector('#modal');modal.innerHTML='';modal.removeAttribute('open');const t=doc.querySelector('#toast');t.textContent='';t.className='toast';return '<!doctype html>\n'+doc.outerHTML;
  }
  function bundle() {
    if(!draft)return;
    const snapshot=C.validate({...draft,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()}),enc=new TextEncoder(),files=[['index.html',enc.encode(snapshotHTML(snapshot))]];
    for(const[name,value]of Object.entries(assets)){files.push([name,value.encoding==='base64'?Uint8Array.from(atob(value.content),c=>c.charCodeAt(0)):enc.encode(value.content.replaceAll('__REVISION__',snapshot.revision))]);}
    download(`olda-4-0-cloudflare-${C.today()}.zip`,zip(files));toast('Web je stažený. Nasazuj celý ZIP, včetně sw.js a ikon.');
  }
  async function install() {
    if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone){toast('Appku už používáš z plochy.');return;}
    if(installEvent){await installEvent.prompt();const r=await installEvent.userChoice;if(r.outcome==='accepted'){installEvent=null;toast('Appka je připravená k instalaci.');}return;}
    openModal('Olda 4.0 na ploše mobilu',`<p>Otevři web online v běžném prohlížeči svého telefonu.</p><div class="install-info"><strong>iPhone / iPad · Safari</strong>Sdílení → Přidat na plochu → Přidat.<br><br><strong>Android · Chrome</strong>Menu ⋮ → Instalovat aplikaci / Přidat na plochu.<br><br><strong>Počítač · Chrome / Edge</strong>Ikona instalace v adresním řádku nebo v menu prohlížeče.</div><p class="footnote">Offline režim je dostupný po prvním online načtení na HTTPS nebo při lokálním náhledu přes localhost.</p>`);
  }
  async function initPWA() {
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});
    window.addEventListener('appinstalled',()=>{installEvent=null;toast('Olda 4.0 je teď na ploše.');});
    if('serviceWorker'in navigator && location.protocol!=='file:'){
      try {const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){updateReady=true;render();}});});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updateReady)render();});window.addEventListener('focus',()=>reg.update().catch(()=>{}));window.addEventListener('online',()=>reg.update().catch(()=>{}));}
      catch {toast('Offline režim se zatím nepodařilo připravit. Online web funguje dál.',true);}
    }
  }
  // The shared engine mounts inside this original app. Keep the original home,
  // gift and heatmap, but let the common account/diary model own all writes.
  if(cloudConfig.mode==='shared') {
    window.OldaOriginal={home,icon,profile:published.profile,seed:published};
    return;
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-page],[data-action],[data-filter],[data-period]');if(!el)return;
    if(el.dataset.page){e.preventDefault();goto(el.dataset.page);return;}
    if(el.dataset.filter){sessionFilter=el.dataset.filter;render();return;}
    if(el.dataset.period){period=el.dataset.period;render();return;}
    const a=el.dataset.action,id=el.dataset.id||'';
    if(a==='close')closeModal();
    if(a==='session')formSession(id);
    if(a==='day')formDay(id);
    if(a==='habit')formHabit(id);
    if(a==='milestone')formMilestone(id);
    if(a==='plan')formPlan();
    if(a==='profile')formProfile();
    if(a==='enter-editor')enterEditor();
    if(a==='exit-editor'){if(saving){toast('Počkej prosím na potvrzení uložení online.');return;}draft=null;dirty=false;conflict=false;render();toast('Zpátky v přehledu. Případný neodeslaný návrh zůstává uložený v zařízení.');}
    if(a==='save-online')sendOnline();
    if(a==='resolve-conflict')resolveConflict();
    if(a==='refresh-cloud')refreshCloud(true);
    if(a==='logout-coach')logoutCoach();
    if(a==='exit-preview'){importedPreview=null;render();}
    if(a==='add-exercise')$('#exercise-rows').insertAdjacentHTML('beforeend',exerciseRow());
    if(a==='add-plan-row')$('#plan-rows').insertAdjacentHTML('beforeend',planRow());
    if(a==='remove-row')el.closest('.exercise-inputs').remove();
    if(a==='export-json')exportJSON();
    if(a==='import-json')importJSON();
    if(a==='bundle')bundle();
    if(a==='install')install();
    if(a==='reload')location.reload();
    if(a==='delete-record'&&draft){const kind=el.dataset.kind;askInApp('Smazat tento zápis?', cloud ? 'Po potvrzeném uložení online se zápis odstraní ze společného přehledu. Předchozí verze zůstane v serverové záloze.' : 'Odstraníme ho z pracovního návrhu.', 'Smazat zápis', ()=>{const next=JSON.parse(JSON.stringify(draft));const key={session:'sessions',day:'days',milestone:'milestones'}[kind];next[key]=next[key].filter(x=>(kind==='day'?x.date:x.id)!==id);commit(next);});}
  });
  document.addEventListener('submit',e=>{if(e.target.id==='coach-login-form'){e.preventDefault();submitCoachLogin(e.target);}if(e.target.id==='record-form'){e.preventDefault();try{saveForm(e.target);}catch(error){$('#form-error').textContent=error.message;}}});
  document.addEventListener('input',e=>{if(e.target.id==='session-search'){search=e.target.value;const cursor=e.target.selectionStart;render();const input=$('#session-search');input.focus();try{input.setSelectionRange(cursor,cursor);}catch{}}});
  $('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=$('#modal').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
  window.addEventListener('online',()=>{render();refreshCloud().then(()=>sendOnline());});window.addEventListener('offline',render);
  window.addEventListener('focus',()=>refreshCloud());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshCloud();});
  window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  if (cloud) { const cached = client.cached(); if (cached) { published = cached.data; role = cached.role; } }
  render();initPWA();refreshCloud();
  if (cloud) setInterval(()=>{if(document.visibilityState==='visible')refreshCloud();},20000);
})();
