// "What next after the first month": three ready-to-use ways to continue, each an editable example.
// The chosen program lives in settings.trainingProgram; swapping an exercise only changes the default
// for that slot. Nothing here is generated per person — Michal's tailored plans stay a personal service.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const EQUIPMENT=Object.freeze([
  {id:'bw',label:'Vlastní váha'},
  {id:'free',label:'Jednoručky, KB, kotouče'},
  {id:'barbell',label:'Osa'},
  {id:'band',label:'Expandér'},
  {id:'machine',label:'Stroje a kladky'},
]);

const slot=(label,pattern,exercise,reps)=>Object.freeze({label,pattern,exercise,reps});

export const PROGRAMS=Object.freeze([
  {
    id:'ab',name:'A/B celé tělo',badge:'Pokračování ITFIT',
    who:'Pro každého po prvním měsíci. Nemusíš nic skládat, jedeš dál to, co znáš.',
    freq:'2–3× týdně, střídáš A a B',
    week:['A','','B','','A','',''],
    weekNote:'Další týden začneš B: B / A / B.',
    focus:'fullbody',
    days:[
      {key:'a',name:'Trénink A',slots:[slot('Dřepový pohyb','squat','goblet-squat','8–12'),slot('Vodorovný tlak','horizontal_push','push-up','6–15'),slot('Tah / záda','horizontal_pull','band-row','6–12'),slot('Střed těla / stabilita','carry','suitcase-carry','30–45 s')]},
      {key:'b',name:'Trénink B',slots:[slot('Kyčelní ohyb','hinge','romanian-deadlift','8–15'),slot('Tlak nad hlavu','vertical_push','plate-overhead','6–12'),slot('Jedna noha / stabilita','squat','reverse-lunge','6–10 / noha'),slot('Lopatky / zadní ramena','horizontal_pull','face-pull','10–15')]},
    ],
  },
  {
    id:'upper-lower',name:'Vršek / spodek',badge:'Víc prostoru',
    who:'Když chodíš 3–4× týdně a chceš víc práce na každou část těla.',
    freq:'3–4× týdně, střídáš spodek a vršek',
    week:['S','','V','','S','',''],
    weekNote:'Při 3 trénincích další týden obráceně: V / S / V. Při 4 pravidelně S / V / S / V.',
    focus:'upper',
    days:[
      {key:'lower',name:'Spodek',focus:'lower',slots:[slot('Dřep','squat','goblet-squat','8–12'),slot('Kyčelní ohyb','hinge','romanian-deadlift','8–12'),slot('Jedna noha','squat','split-squat','8–10 / noha'),slot('Střed těla','core','dead-bug','8–10 / strana')]},
      {key:'upper',name:'Vršek',focus:'upper',slots:[slot('Vodorovný tlak','horizontal_push','dumbbell-press','8–12'),slot('Vodorovný tah','horizontal_pull','dumbbell-row','8–12'),slot('Tlak nad hlavu','vertical_push','overhead-press','8–12'),slot('Svislý tah','vertical_pull','lat-pulldown','8–12')]},
    ],
  },
  {
    id:'squat-hinge',name:'Dřep + tlak / Kyčle + tah',badge:'Celé tělo jinak',
    who:'Když chceš dál celé tělo, ale jinak poskládané: jeden den dřep a tlaky, druhý kyčle a tahy.',
    freq:'2–4× týdně, střídáš oba dny',
    week:['1','','2','','1','',''],
    weekNote:'Další týden začneš dnem 2. Při čtyřech trénincích 1 / 2 / 1 / 2.',
    focus:'fullbody',
    days:[
      {key:'push',name:'Dřep + tlak',slots:[slot('Dřep','squat','goblet-squat','8–12'),slot('Vodorovný tlak','horizontal_push','push-up','6–15'),slot('Tlak nad hlavu','vertical_push','overhead-press','8–12'),slot('Střed těla','core','plank','30–45 s')]},
      {key:'pull',name:'Kyčle + tah',slots:[slot('Kyčelní ohyb','hinge','romanian-deadlift','8–12'),slot('Vodorovný tah','horizontal_pull','dumbbell-row','8–12'),slot('Svislý tah','vertical_pull','lat-pulldown','8–12'),slot('Nošení','carry','farmer-carry','30–45 s')]},
    ],
  },
].map(program=>Object.freeze(program)));

export const programById=id=>PROGRAMS.find(program=>program.id===id);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'));

/** Strict validation shared by the browser and the Worker. Unknown exercise ids fall back on render. */
export function programSettings(input) {
  if(input===null||input===undefined)return null;
  const program=input&&typeof input==='object'?programById(input.id):null;
  if(!program||!validDate(input.since)||!input.choices||typeof input.choices!=='object'||Array.isArray(input.choices))throw new Error('Tréninkový program má neplatný formát.');
  const choices={};
  for(const [key,value] of Object.entries(input.choices)) {
    const day=program.days.find(day=>day.key===key);
    if(!day||!Array.isArray(value)||value.length!==day.slots.length||value.some(id=>id!==null&&(typeof id!=='string'||!/^[a-z0-9-]{1,100}$/.test(id))))throw new Error('Výběr cviků v programu má neplatný formát.');
    choices[key]=[...value];
  }
  return {id:program.id,since:input.since,choices};
}

/** The exercise actually used for a slot: the person's own choice when it still exists, else the default. */
export function programDays(settings,library) {
  const chosen=programSettings(settings?.trainingProgram??null);
  if(!chosen)return null;
  const program=programById(chosen.id),byId=new Map(library.map(exercise=>[exercise.id,exercise]));
  return {program,chosen,days:program.days.map(day=>({...day,slots:day.slots.map((slot,index)=>{
    const own=chosen.choices[day.key]?.[index],exercise=own&&byId.get(own)?.pattern===slot.pattern?byId.get(own):byId.get(slot.exercise);
    return {...slot,index,exercise,changed:!!own&&exercise?.id===own&&own!==slot.exercise};
  })}))};
}

export function chooseProgram(settings,id,today) {
  if(!programById(id))throw new Error('Tento program neexistuje.');
  const current=programSettings(settings.trainingProgram??null);
  return {...settings,trainingProgram:current?.id===id?current:{id,since:today,choices:{}}};
}

export function swapProgramExercise(settings,dayKey,index,exerciseId,library) {
  const current=programSettings(settings.trainingProgram??null);
  if(!current)throw new Error('Nejdřív si vyber, jak chceš pokračovat.');
  const program=programById(current.id),day=program.days.find(day=>day.key===dayKey),slot=day?.slots[index];
  const exercise=library.find(exercise=>exercise.id===exerciseId);
  if(!slot||!exercise||exercise.pattern!==slot.pattern)throw new Error('Tento cvik do tohoto místa v tréninku nepatří.');
  const choices={...current.choices,[dayKey]:[...(current.choices[dayKey]||day.slots.map(()=>null))]};
  choices[dayKey][index]=exercise.id===slot.exercise?null:exercise.id;
  if(choices[dayKey].every(id=>id===null))delete choices[dayKey];
  return {...settings,trainingProgram:{...current,choices}};
}

const repsText=reps=>/ s$/.test(reps)?reps:reps.replace(/^(\d+–\d+)/,'$1 opakování');
const DAY_LETTERS=['Po','Út','St','Čt','Pá','So','Ne'];
const weekStrip=program=>`<div class="program-week" aria-label="Ukázkový týden">${program.week.map((mark,index)=>`<span class="${mark?'is-on':''}"><small>${DAY_LETTERS[index]}</small><b>${mark||'·'}</b></span>`).join('')}</div>`;

/** The fork after the first month. Every option is usable right away. */
export function renderProgramChooser(current=null,{icon=()=>''}={}) {
  return `<section class="panel program-chooser" id="program-chooser"><p class="eyebrow">PO PRVNÍM MĚSÍCI</p><h2 class="panel-title">Jak chceš pokračovat?</h2><p class="panel-subtitle">Vault ti zůstává: tréninky, mobilita i atlas. Tady si vybereš rozložení na další týdny a zapisuješ ho do deníku. Výchozí cviky si můžeš kdykoli vyměnit.</p><div class="program-options">${PROGRAMS.map(program=>`<article class="program-option ${current===program.id?'is-current':''}"><div class="program-option-head"><span class="tag">${esc(program.badge)}</span>${current===program.id?'<span class="tag goal-met">Používáš</span>':''}</div><h3>${esc(program.name)}</h3><p>${esc(program.who)}</p><dl><div><dt>Kolikrát</dt><dd>${esc(program.freq)}</dd></div><div><dt>Tréninky</dt><dd>${program.days.map(day=>esc(day.name)).join(' · ')}</dd></div></dl>${weekStrip(program)}<p class="form-hint">${esc(program.weekNote)}</p><button class="button ${program.id==='ab'?'primary':'secondary'}" type="button" data-action="program-choose" data-program="${program.id}">${current===program.id?'Zůstat u tohoto':program.id==='ab'?'Pokračovat s A/B':'Vybrat '+esc(program.name.toLocaleLowerCase('cs-CZ'))}</button></article>`).join('')}</div><p class="form-hint">Chceš plán přímo na sebe, podle cíle a vybavení? To je spolupráce s Michalem, ne automat v aplikaci.</p></section>`;
}

/** The chosen program as two (or more) workouts with their exercises. */
export function renderProgram(view,{patternLabel=id=>id,icon=()=>''}={}) {
  const {program,days}=view;
  return `<section class="panel program-current" id="program"><div class="panel-header"><div><p class="eyebrow">MŮJ PROGRAM</p><h2 class="panel-title">${esc(program.name)}</h2><p class="panel-subtitle">${esc(program.freq)}. ${esc(program.weekNote)}</p></div><button class="button ghost small" type="button" data-action="program-change">Změnit program</button></div><div class="program-days">${days.map(day=>`<article class="program-day"><div class="program-day-head"><h3>${esc(day.name)}</h3><button class="button primary small" type="button" data-action="program-log" data-day="${day.key}">${icon('plus')}Zapsat ${esc(day.name.charAt(0).toLocaleLowerCase('cs-CZ')+day.name.slice(1))}</button></div><ol class="program-slots">${day.slots.map(slot=>`<li><div><small>${esc(slot.label)}</small><strong>${esc(slot.exercise?.name||'Vyber cvik')}</strong><span>${esc(repsText(slot.reps))} · ${esc(patternLabel(slot.pattern))}${slot.changed?' · tvoje volba':''}</span></div><button class="button ghost small" type="button" data-action="program-swap" data-day="${day.key}" data-index="${slot.index}">Vyměnit</button></li>`).join('')}</ol></article>`).join('')}</div><p class="form-hint">Série a zátěž si zapisuješ u každého tréninku. Když technika drží a poslední opakování jdou čistě, přidej opakování nebo trochu zátěže.</p></section>`;
}

/** Same-pattern alternatives for one slot, filterable by equipment. */
export function renderSwapPicker(view,dayKey,index,library,equipment='all') {
  const day=view.days.find(day=>day.key===dayKey),slot=day?.slots[index];
  if(!slot)return '';
  const options=library.filter(exercise=>exercise.pattern===slot.pattern&&(equipment==='all'||(exercise.equipment||[]).includes(equipment)));
  const available=new Set(library.filter(exercise=>exercise.pattern===slot.pattern).flatMap(exercise=>exercise.equipment||[]));
  return `<div class="program-picker"><p class="eyebrow">${esc(day.name)} · ${esc(slot.label)}</p><h2>Vyměnit cvik</h2><p class="form-hint">Nabízíme jen cviky se stejným pohybem, takže trénink zůstane vyvážený.</p><div class="filter-row">${[['all','Vše'],...EQUIPMENT.filter(item=>available.has(item.id)).map(item=>[item.id,item.label])].map(([id,label])=>`<button class="filter-chip ${equipment===id?'active':''}" type="button" data-action="program-equipment" data-equipment="${id}">${esc(label)}</button>`).join('')}</div><div class="program-picker-list">${options.map(exercise=>`<button type="button" class="program-pick ${slot.exercise?.id===exercise.id?'is-current':''}" data-action="program-pick" data-exercise-id="${exercise.id}"><strong>${esc(exercise.name)}</strong><small>${(exercise.equipment||[]).map(id=>esc(EQUIPMENT.find(item=>item.id===id)?.label||'')).join(' · ')||'Vlastní cvik'}${slot.exercise?.id===exercise.id?' · teď v programu':''}</small></button>`).join('')||'<p class="form-hint">S tímto vybavením tu zatím nic není. Zkus jiný filtr.</p>'}</div></div>`;
}
