import {isTraining,isCardio,localDate,validateEntry,jointTrainingHistory} from './domain.mjs';
import {personalSettings} from './personal.mjs';
import {planWeekDates,PLAN_DAYS} from './planning.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=date=>new Date(date+'T12:00:00').toLocaleDateString('cs-CZ',{day:'numeric',month:'numeric'});
const recordId=(slot,date)=>`${slot.id}-${date}`;
const checkId=(slot,date)=>`${date}:${slot.id}`;
const ordered=(entries,today)=>entries.filter(e=>isTraining(e)&&validateEntry(e,today).valid).sort((a,b)=>a.date.localeCompare(b.date)||String(a.createdAt||'').localeCompare(String(b.createdAt||''))||a.id.localeCompare(b.id));
function match(entries,slot,date){return entries.find(e=>e.id===recordId(slot,date))||entries.find(e=>e.date===date&&(e.together===true)===slot.together);}
export function advanceRoutineReference(reference,previousDay,today=localDate()) {
  return previousDay&&planWeekDates(reference)[0]===planWeekDates(previousDay)[0]?new Date(today+'T12:00:00'):reference;
}
const simpleEntry=(entry,id,title)=>entry.id===id&&entry.title===title&&!entry.note&&!entry.duration&&!entry.steps&&!entry.distance&&!entry.elevation&&!entry.photoId&&!entry.location&&!entry.workout&&!entry.exerciseDetails?.length&&!entry.mobilityExercises?.length&&entry.energy==null&&entry.mood==null&&!Object.keys(entry.values||{}).length;

export function trainingRoutineWeek(state,reference=new Date(),today=localDate()) {
  const {trainingRoutine,trainingSkips}=personalSettings(state.settings);
  const dates=planWeekDates(reference),records=ordered(state.entries,today),ordinals=new Map(records.map((e,i)=>[e.id,i+1])),joint=jointTrainingHistory(state.entries,state.settings,new Date(today+'T12:00:00'));
  const slots=trainingRoutine.map(slot=>({...slot,date:dates[slot.weekday]})).filter(slot=>slot.date>=slot.since).sort((a,b)=>a.weekday-b.weekday||a.id.localeCompare(b.id)).map(slot=>{
    const entry=match(records,slot,slot.date),missed=trainingSkips.some(s=>s.id===checkId(slot,slot.date));
    return {...slot,entry,ordinal:entry?ordinals.get(entry.id):null,jointOrdinal:entry&&joint.anchored?joint.ordinals.get(entry.id):null,status:entry?'done':missed?'missed':'pending',future:slot.date>today};
  });
  return {dates,slots,total:slots.length,completed:slots.filter(slot=>slot.status==='done').length};
}

/** A positive answer is an actual diary entry. A negative answer is only a decision. */
export function answerTraining(state,slotId,date,answer,today=localDate()) {
  if(!['yes','no','reset'].includes(answer))throw new Error('Vyber Ano nebo Ne.');
  const {trainingRoutine,trainingSkips}=personalSettings(state.settings),slot=trainingRoutine.find(s=>s.id===slotId);
  if(!slot||date>today||date<slot.since||planWeekDates(date)[slot.weekday]!==date)throw new Error('Trénink můžeš potvrdit až v jeho den nebo zpětně.');
  const found=match(ordered(state.entries,today),slot,date);
  let entries=state.entries,skips=trainingSkips.filter(s=>s.id!==checkId(slot,date));
  if(answer==='yes'&&!found){
    const result=validateEntry({id:recordId(slot,date),type:'strength',date,duration:0,durationUnknown:true,together:slot.together,title:slot.label,note:'',createdAt:date+'T12:00:00.000Z'},today);
    if(!result.valid)throw new Error(result.errors.join(' '));
    entries=[...entries,result.entry];
  } else if(answer!=='yes'&&found){
    if(found.id===state.settings.jointTrainingAnchor?.entryId)throw new Error('Tento trénink určuje společné pořadí. Případnou opravu udělej v deníku.');
    // Never erase a manual record or any detail added later through the full form.
    const simple=simpleEntry(found,recordId(slot,date),slot.label);
    if(!simple)throw new Error('Tento trénink už má vlastní zápis. Uprav nebo smaž ho v deníku; jeho údaje tu nepřepíšeme.');
    entries=entries.filter(e=>e.id!==found.id);
  }
  if(answer==='no')skips=[...skips,{id:checkId(slot,date),date,slotId:slot.id}].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).slice(-4000);
  return {...state,entries,settings:{...state.settings,trainingSkips:skips},onboardingComplete:true};
}

const cardioId=(start,index)=>`cardio-${start}-${index+1}`;
export function cardioWeek(state,reference=new Date(),today=localDate()) {
  const {weeklyCardio:config}=personalSettings(state.settings),dates=planWeekDates(reference),start=dates[0],end=dates[6];
  if(!config)return {config:null,start,end,records:[],slots:[],completed:0};
  const records=state.entries.filter(e=>isCardio(e)&&e.date>=start&&e.date<=end&&e.date>=config.since&&validateEntry(e,today).valid).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const slots=Array.from({length:config.target},(_,index)=>({index,id:cardioId(start,index),entry:records.find(e=>e.id===cardioId(start,index))}));
  const used=new Set(slots.filter(s=>s.entry).map(s=>s.entry.id)),remaining=records.filter(e=>!used.has(e.id));
  for(const slot of slots)if(!slot.entry)slot.entry=remaining.shift();
  return {config,start,end,records,slots,completed:records.length};
}

/** Each weekly tick records one dated cardio activity in the common diary. */
export function answerCardio(state,reference,index,completed,date,today=localDate()) {
  const week=cardioWeek(state,reference,today),slot=week.slots[index];
  if(!slot||!Number.isInteger(index)||typeof completed!=='boolean'||week.start>today||week.end<week.config.since||week.config.since>today)throw new Error('Vyber platné kardio v aktuálním nebo minulém týdnu.');
  if(completed&&slot.entry)return state;
  if(!completed&&!slot.entry)return state;
  let entries=state.entries;
  if(completed){
    if(typeof date!=='string'||date<week.start||date>week.end||date<week.config.since||date>today)throw new Error('Vyber skutečný den aktivity v tomto týdnu, nejpozději dnes.');
    if(entries.some(e=>e.id===slot.id))throw new Error('Původní zápis byl přesunut do jiného týdne. Uprav ho v deníku.');
    const result=validateEntry({id:slot.id,type:'cardio',date,duration:0,durationUnknown:true,title:week.config.label,note:'',together:false,createdAt:date+'T12:00:00.000Z'},today);
    if(!result.valid)throw new Error(result.errors.join(' '));
    entries=[...entries,result.entry];
  }else{
    if(!simpleEntry(slot.entry,slot.id,week.config.label))throw new Error('Kardio má vlastní zápis. Uprav nebo smaž ho v deníku; jeho údaje tu nepřepíšeme.');
    entries=entries.filter(e=>e.id!==slot.entry.id);
  }
  return {...state,entries,onboardingComplete:true};
}

export function renderCardioRoutine(state,reference=new Date(),chosenDate='',today=localDate()) {
  const week=cardioWeek(state,reference,today);
  if(!week.config)return '';
  const active=week.end>=week.config.since&&week.start<=today&&week.config.since<=today;
  const date=chosenDate||(today>=week.start&&today<=week.end?today:'');
  const validDate=active&&date>=week.start&&date<=week.end&&date>=week.config.since&&date<=today;
  const min=week.start>week.config.since?week.start:week.config.since,max=week.end<today?week.end:today;
  return `<section class="panel training-routine cardio-routine" aria-label="Týdenní kardio"><div class="panel-header"><div><p class="eyebrow">KARDIO MÁ VLASTNÍ MÍSTO</p><h2 class="panel-title">${esc(week.config.label)}</h2><p class="panel-subtitle">${week.completed} z ${week.config.target} splněno · ${stamp(week.start)} – ${stamp(week.end)} ${week.end.slice(0,4)}</p></div></div>${active?`<div class="routine-edit cardio-date"><label class="form-field date-field">Den aktivity<input id="cardio-date" type="date" value="${esc(date)}" min="${min}" max="${max}" /></label><p class="form-hint">${date===today?'Předvyplněný je dnešek.':'Vyber den, kdy kardio proběhlo.'} Stačí odškrtnout splnění, čas ani druh sportu nejsou povinné.</p></div>`:''}<div class="cardio-slots">${week.slots.map(slot=>`<article class="routine-slot ${slot.entry?'is-done':''}"><h3>${slot.index+1}. kardio</h3><p class="routine-status">${slot.entry?'✓ Splněno · '+stamp(slot.entry.date):!active?week.start>today?'Příští týden':'Před začátkem evidence':'Čeká na společný zápis'}</p><button type="button" role="checkbox" aria-checked="${!!slot.entry}" aria-label="${slot.index+1}. kardio splněno" class="button secondary routine-edit cardio-check" data-action="cardio-answer" data-cardio-index="${slot.index}" data-cardio-week="${week.start}" data-cardio-complete="${!slot.entry}" ${!active||!slot.entry&&!validDate?'disabled':''}><span aria-hidden="true">${slot.entry?'☑':'☐'}</span>${slot.entry?'Splněno':'Odškrtnout splnění'}</button></article>`).join('')}</div><p class="form-hint">Bez pevných dnů. Kolo i jiné zapsané kardio se započítají automaticky. Silové a společné počítadlo zůstává zvlášť.</p></section>`;
}

export function renderTrainingRoutine(state,reference=new Date(),today=localDate()) {
  if(!state.settings.trainingRoutine?.length)return '';
  const week=trainingRoutineWeek(state,reference,today),start=week.dates[0],end=week.dates[6];
  return `<section class="panel training-routine" aria-label="Silový týden"><div class="panel-header"><div><p class="eyebrow">TVŮJ SILOVÝ TÝDEN</p><h2 class="panel-title">${week.completed} z ${week.total} tréninků splněno</h2><p class="panel-subtitle">${stamp(start)} – ${stamp(end)} ${end.slice(0,4)} · jen posilování</p></div><div class="routine-navigation"><button class="button ghost small" data-action="routine-prev" aria-label="Předchozí silový týden">←</button><button class="button ghost small" data-action="routine-today">Tento týden</button><button class="button ghost small" data-action="routine-next" aria-label="Další silový týden">→</button></div></div><div class="routine-slots">${week.slots.map(slot=>`<article class="routine-slot ${slot.status==='done'?'is-done':slot.status==='missed'?'is-missed':''}"><div class="routine-date"><strong>${PLAN_DAYS[slot.weekday]}</strong><time datetime="${slot.date}">${stamp(slot.date)}</time></div><h3>${esc(slot.label)}</h3><p class="routine-status">${slot.status==='done'?`✓ Splněno · ${slot.jointOrdinal?`společný trénink #${slot.jointOrdinal}`:`trénink #${slot.ordinal}`}`:slot.status==='missed'?'Vynecháno':slot.future?'Naplánováno':'Čeká na společný zápis'}</p><div class="routine-edit" role="group" aria-label="${esc(PLAN_DAYS[slot.weekday]+' '+slot.label+' '+stamp(slot.date))}">${[['yes','Ano, splněno','done'],['no','Ne','missed']].map(([answer,label,status])=>`<button class="button secondary small" data-action="routine-answer" data-slot-id="${slot.id}" data-slot-date="${slot.date}" data-answer="${answer}" aria-pressed="${slot.status===status}" ${slot.future?'disabled':''}>${label}</button>`).join('')}${slot.status==='missed'?`<button class="button ghost small" data-action="routine-answer" data-slot-id="${slot.id}" data-slot-date="${slot.date}" data-answer="reset" aria-label="Zrušit odpověď: ${esc(slot.label)}">↶</button>`:''}</div>${slot.entry?`<button class="button ghost small routine-edit" data-action="edit" data-id="${esc(slot.entry.id)}">Doplnit detail</button>`:''}</article>`).join('')||'<p class="form-hint">Tréninkový rytmus v tomto týdnu ještě nezačal.</p>'}</div><p class="form-hint">Ano přičte jeden skutečný trénink. Ne se do počtu nezapočítá. Nevyplněný den nic nepředpokládá.<span class="routine-read-hint"> Odpovědi zadáte ve společném zápisu přes šipku vpravo dole.</span></p></section>`;
}
