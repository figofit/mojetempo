// Shared, optional details used by both the personal Olda app and Moje IT FIT.
import {normalizeTrainingHistory} from './history-model.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const PERSONAL_DEFAULTS=Object.freeze({customHabits:[],personalFields:[],personalPlan:{title:'',focus:'',notes:'',exercises:[]},personalProfile:null,trainingRoutine:[],trainingSkips:[],jointTrainingAnchor:null,weeklyCardio:null,trainingHistory:null});
const text=(value,max)=>typeof value==='string'&&value.length<=max;
export function personalSettings(input={}) {
  const output={};
  const habits=input.customHabits??[];
  if(!Array.isArray(habits)||habits.length>50)throw new Error('Nejvýše 50 vlastních návyků.');
  const used=new Set();
  output.customHabits=habits.map(h=>{
    if(!h||!/^custom-[A-Za-z0-9_-]{1,100}$/.test(h.id)||used.has(h.id)||!text(h.name,100)||!h.name.trim()||!text(h.note,500)||!Number.isInteger(h.target)||h.target<1||h.target>7||typeof h.archived!=='boolean')throw new Error('Vlastní návyk potřebuje název, jedinečné ID a cíl 1 až 7 dní.');
    used.add(h.id);return {id:h.id,name:h.name,note:h.note,target:h.target,archived:h.archived};
  });
  const fields=input.personalFields??[];
  if(!Array.isArray(fields)||fields.length>30)throw new Error('Nejvýše 30 vlastních údajů.');
  const fieldIds=new Set();
  output.personalFields=fields.map(f=>{
    if(!f||!/^field-[A-Za-z0-9_-]{1,80}$/.test(f.id)||fieldIds.has(f.id)||!text(f.name,100)||!f.name.trim()||!['text','number','boolean'].includes(f.type)||!text(f.unit??'',30))throw new Error('Vlastní údaj potřebuje název a typ.');
    fieldIds.add(f.id);return {id:f.id,name:f.name,type:f.type,unit:f.unit||''};
  });
  const plan=input.personalPlan??PERSONAL_DEFAULTS.personalPlan;
  if(!plan||!text(plan.title,160)||!text(plan.focus,4000)||!text(plan.notes,4000)||!Array.isArray(plan.exercises)||plan.exercises.length>80||plan.exercises.some(e=>!e||!text(e.name,120)||!e.name.trim()||!text(e.dose,120)||!text(e.note,1000)))throw new Error('Osobní plán má neplatný formát.');
  output.personalPlan={title:plan.title,focus:plan.focus,notes:plan.notes,exercises:plan.exercises.map(e=>({name:e.name,dose:e.dose,note:e.note}))};
  const p=input.personalProfile??null;
  if(p!==null) {
    if(!p||!text(p.name,80)||!p.name.trim()||!text(p.salutation,80)||!p.salutation.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(p.birthday)||!Number.isFinite(Date.parse(p.birthday+'T12:00:00Z'))||new Date(p.birthday+'T12:00:00Z').toISOString().slice(0,10)!==p.birthday||!Number.isInteger(p.age)||p.age<1||p.age>120||!text(p.dedication,4000)||!text(p.signature,160)||!text(p.vaultUrl,500))throw new Error('Osobní profil má neplatný formát.');
    if(p.vaultUrl&&new URL(p.vaultUrl).protocol!=='https:')throw new Error('Vault potřebuje HTTPS odkaz.');
  }
  output.personalProfile=p?Object.fromEntries(['name','salutation','birthday','age','dedication','signature','vaultUrl'].map(key=>[key,p[key]])):null;
  const anchor=input.jointTrainingAnchor??null;
  if(anchor!==null&&(!anchor||typeof anchor.entryId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,179}$/.test(anchor.entryId)||!Number.isSafeInteger(anchor.number)||anchor.number<1||anchor.number>1000000))throw new Error('Společné pořadí potřebuje skutečný trénink a kladné celé číslo.');
  output.jointTrainingAnchor=anchor?{entryId:anchor.entryId,number:anchor.number}:null;
  output.trainingHistory=normalizeTrainingHistory(input.trainingHistory);
  if(output.trainingHistory&&anchor&&output.trainingHistory.total!==anchor.number)throw new Error('Historický celek musí souhlasit s potvrzeným společným pořadím.');
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='1900-01-01'&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const routineId=value=>typeof value==='string'&&/^routine-[A-Za-z0-9-]{1,60}$/.test(value);
  const cardio=input.weeklyCardio??null;
  if(cardio!==null&&(!cardio||!Number.isInteger(cardio.target)||cardio.target<1||cardio.target>7||!text(cardio.label,80)||!cardio.label.trim()||!validDate(cardio.since)))throw new Error('Týdenní kardio potřebuje název, cíl 1 až 7 aktivit a začátek.');
  output.weeklyCardio=cardio?{target:cardio.target,label:cardio.label.trim(),since:cardio.since}:null;
  const routine=input.trainingRoutine??[],skips=input.trainingSkips??[];
  if(!Array.isArray(routine)||routine.length>14||!Array.isArray(skips)||skips.length>4000)throw new Error('Neplatný tréninkový rytmus.');
  const routineIds=new Set(),routineDays=new Set();
  output.trainingRoutine=routine.map(slot=>{
    if(!slot||!routineId(slot.id)||routineIds.has(slot.id)||routineDays.has(slot.weekday)||!Number.isInteger(slot.weekday)||slot.weekday<0||slot.weekday>6||!text(slot.label,80)||!slot.label.trim()||typeof slot.together!=='boolean'||!validDate(slot.since))throw new Error('Tréninkový rytmus potřebuje jedinečný den, název a datum začátku.');
    routineIds.add(slot.id);routineDays.add(slot.weekday);return {id:slot.id,weekday:slot.weekday,label:slot.label.trim(),together:slot.together,since:slot.since};
  });
  const skipIds=new Set();
  output.trainingSkips=skips.map(skip=>{
    if(!skip||!routineId(skip.slotId)||!validDate(skip.date)||skip.id!==`${skip.date}:${skip.slotId}`||skipIds.has(skip.id))throw new Error('Neplatné vynechání tréninku.');
    skipIds.add(skip.id);return {id:skip.id,date:skip.date,slotId:skip.slotId};
  });
  return output;
}
export function personalEntry(input,errors) {
  const out={};
  if(input.datePrecision!==undefined){if(input.datePrecision!=='week')errors.push('Neplatná přesnost data.');else out.datePrecision='week';}
  if(input.exerciseDetails!==undefined){
    if(!Array.isArray(input.exerciseDetails)||input.exerciseDetails.length>80)errors.push('Neplatné cviky.');
    else out.exerciseDetails=input.exerciseDetails.map(e=>{
      if(!e||!text(e.name,120)||!e.name.trim()||!Number.isInteger(e.sets)||e.sets<0||e.sets>100||!Number.isInteger(e.reps)||e.reps<0||e.reps>10000||typeof e.weight!=='number'||!Number.isFinite(e.weight)||e.weight<0||e.weight>1500)errors.push('Neplatné série, opakování nebo zátěž.');
      return {name:e?.name,sets:e?.sets,reps:e?.reps,weight:e?.weight};
    });
  }
  for(const field of ['together','durationUnknown'])if(input[field]!==undefined){if(typeof input[field]!=='boolean')errors.push('Neplatný příznak zápisu.');else out[field]=input[field];}
  if(input.energy===null)out.energy=null;
  else if(input.energy!==undefined){if(!Number.isInteger(Number(input.energy))||Number(input.energy)<1||Number(input.energy)>5)errors.push('Energie musí být 1 až 5.');else out.energy=Number(input.energy);}
  if(input.values!==undefined) {
    if(!input.values||typeof input.values!=='object'||Array.isArray(input.values)||Object.keys(input.values).length>30)errors.push('Neplatné vlastní údaje.');
    else {out.values={};for(const [id,value] of Object.entries(input.values)){if(!/^field-[A-Za-z0-9_-]{1,80}$/.test(id)||!['string','number','boolean'].includes(typeof value)||typeof value==='string'&&value.length>1000||typeof value==='number'&&!Number.isFinite(value))errors.push('Neplatná hodnota vlastního údaje.');else out.values[id]=value;}}
  }
  return out;
}
export function renderPersonalPlan(settings) {
  const {personalPlan:p}=personalSettings(settings);
  return `<section class="panel"><h2 class="panel-title">Osobní plán s Michalem</h2><form id="personal-plan-form"><label class="form-field">Název plánu<input name="title" maxlength="160" value="${esc(p.title)}"></label><label class="form-field">Zaměření<textarea name="focus" maxlength="4000">${esc(p.focus)}</textarea></label><div id="personal-plan-rows">${p.exercises.map(personalPlanRow).join('')}</div><button type="button" class="button secondary small" data-action="personal-plan-add">Přidat cvik do plánu</button><label class="form-field">Poznámky<textarea name="notes" maxlength="4000">${esc(p.notes)}</textarea></label><button class="button primary">Uložit osobní plán</button></form></section>`;
}
export function personalPlanRow(e={name:'',dose:'',note:''}) {return `<div class="personal-plan-row"><label class="form-field">Cvik<input name="planName" maxlength="120" value="${esc(e.name)}" required></label><label class="form-field">Provedení<input name="planDose" maxlength="120" value="${esc(e.dose)}"></label><label class="form-field">Pokyn<input name="planNote" maxlength="1000" value="${esc(e.note)}"></label><button type="button" class="button ghost small" data-action="personal-row-remove">Odebrat</button></div>`;}
export function renderPersonalFields(settings) {
  return `<section class="panel"><h2 class="panel-title">Vlastní údaje k zápisům</h2><p class="form-hint">Přidávejte jen údaje, které chcete společně sledovat.</p>${personalSettings(settings).personalFields.map(f=>`<div class="personal-field-definition"><strong>${esc(f.name)}</strong> <small>${esc(f.unit)}</small></div>`).join('')}<form id="personal-field-form"><div class="form-grid"><label class="form-field">Název<input name="name" maxlength="100" required></label><label class="form-field">Typ<select name="type"><option value="text">Text</option><option value="number">Číslo</option><option value="boolean">Ano / ne</option></select></label><label class="form-field">Jednotka<input name="unit" maxlength="30"></label></div><button class="button secondary">Přidat vlastní údaj</button></form></section>`;
}
