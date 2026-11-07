import {normalizeTrainingHistory} from './history-model.mjs';
import {ACTIVITY_TYPES,isTraining,isJointTraining,isCardio,jointTrainingHistory,localDate,validateEntry} from './domain.mjs';
import {calendarDay,activeRest} from './schedule-rules.mjs';
import {planWeekDates} from './planning.mjs';

export const isPhysicalActivity=entry=>ACTIVITY_TYPES.some(type=>type.id===entry?.type&&type.category==='movement')||entry?.type==='mobility';
const dayIndex=key=>{const d=calendarDay(key);return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;};
const shift=(key,days)=>{const d=calendarDay(key);d.setDate(d.getDate()+days);return localDate(d);};
export function datedActivities(state,today=localDate()) {
  return physicalActivities(state,today).filter(e=>e.datePrecision!=='week');
}
export function physicalActivities(state,today=localDate()) {return state.entries.filter(e=>isPhysicalActivity(e)&&validateEntry(e,today).valid);}

/** Annual checkpoints plus actual new joint sessions, with no daily interpolation. */
export function historicalTotals(state,today=localDate()) {
  const history=normalizeTrainingHistory(state.settings.trainingHistory);
  if(!history)return null;
  const joint=jointTrainingHistory(state.entries,state.settings,new Date(today+'T12:00:00'));
  const added=datedActivities(state,today).filter(e=>isJointTraining(e)&&(e.date>history.through||e.date===history.through&&joint.anchored&&joint.ordinals.get(e.id)>history.total));
  const years=new Map(history.years.map(row=>[row.year,{year:row.year,historical:row.count,added:0}]));
  for(const entry of added){const year=Number(entry.date.slice(0,4));if(!years.has(year))years.set(year,{year,historical:0,added:0});years.get(year).added++;}
  let cumulative=0;
  const series=[...years.values()].sort((a,b)=>a.year-b.year).map(row=>{
    const count=row.historical+row.added;cumulative+=count;
    const partial=row.year===Number(history.startDate.slice(0,4))&&history.startDate.slice(5)!=='01-01'||row.year===Number(history.through.slice(0,4))&&history.through.slice(5)!=='12-31'||row.year===Number(today.slice(0,4))&&today.slice(5)!=='12-31';
    return {...row,count,cumulative,partial};
  });
  const peak=Math.max(...history.years.map(row=>row.count));
  return {history,series,total:history.total+added.length,newJoint:added.length,peak,peakYears:history.years.filter(row=>row.count===peak).map(row=>row.year),anchorMismatch:joint.needsAnchor||joint.anchored&&joint.count!==history.total+added.length};
}

export function anniversaryInfo(history,today=localDate()) {
  const first=calendarDay(history.startDate),now=calendarDay(today);if(!first||!now)return null;
  const years=now.getFullYear()-first.getFullYear(),d=new Date(now.getFullYear(),first.getMonth(),1,12);
  d.setDate(Math.min(first.getDate(),new Date(now.getFullYear(),first.getMonth()+1,0).getDate()));
  const anniversary=localDate(d);
  return {years,anniversary,upcoming:today<anniversary,daysUntil:Math.max(0,dayIndex(anniversary)-dayIndex(today)),elapsedYears:years-(today<anniversary?1:0)};
}

export function trackingStart(state,today=localDate()) {
  const configured=state.settings.trainingSince;
  if(calendarDay(configured)&&configured<=today)return configured;
  return [...datedActivities(state,today).map(e=>e.date),...(state.settings.trainingRoutine||[]).map(s=>s.since),state.settings.weeklyCardio?.since].filter(d=>calendarDay(d)&&d<=today).sort()[0]||today;
}

export function consistencyWeek(state,reference=new Date(),today=localDate()) {
  const dates=planWeekDates(reference),start=dates[0],end=dates[6],since=trackingStart(state,today);
  const records=physicalActivities(state,today).filter(e=>e.date>=start&&e.date<=end&&e.date>=since);
  const planned=(state.settings.trainingRoutine||[]).filter(slot=>dates[slot.weekday]>=slot.since);
  const targets={solo:planned.filter(s=>!s.together).length,joint:planned.filter(s=>s.together).length,cardio:state.settings.weeklyCardio&&end>=state.settings.weeklyCardio.since?state.settings.weeklyCardio.target:0};
  const solo=records.filter(e=>isTraining(e)&&e.together!==true).length,joint=records.filter(e=>isTraining(e)&&e.together===true).length,cardio=records.filter(isCardio).length;
  const extra=records.filter(e=>!isTraining(e)&&!isCardio(e)).length+Math.max(0,solo-targets.solo)+Math.max(0,joint-targets.joint)+Math.max(0,cardio-targets.cardio);
  const target=targets.solo+targets.joint+targets.cardio,fulfilled=Math.min(solo,targets.solo)+Math.min(joint,targets.joint)+Math.min(cardio,targets.cardio);
  const paused=dates.some(date=>activeRest(state.settings,date));
  return {start,end,targets,solo,joint,strength:solo+joint,cardio,extra,target,fulfilled,percent:target?Math.round(fulfilled/target*100):0,active:records.length>0,goalMet:!paused&&target>0&&fulfilled===target,ongoing:start<=today&&today<=end,paused,records};
}

export function consistencySeries(state,today=localDate()) {
  const first=planWeekDates(trackingStart(state,today))[0],last=planWeekDates(today)[0],start=first>shift(last,-77)?first:shift(last,-77);
  const weeks=[];let activeWeeks=0,goalWeeks=0;
  for(let day=start;day<=last;day=shift(day,7)){
    const week=consistencyWeek(state,day,today);if(week.active)activeWeeks++;if(week.goalMet)goalWeeks++;
    weeks.push({...week,activeWeeks,goalWeeks});
  }
  return {start:trackingStart(state,today),weeks,activeWeeks,goalWeeks};
}

export function monthlyConsistency(state,month=localDate().slice(0,7),today=localDate()) {
  if(!/^\d{4}-\d{2}$/.test(month)||!calendarDay(month+'-01'))throw new Error('Vyber platný měsíc.');
  const first=calendarDay(month+'-01'),last=localDate(new Date(first.getFullYear(),first.getMonth()+1,0,12)),since=trackingStart(state,today),activities=datedActivities(state,today);
  const weeklyRecords=physicalActivities(state,today).filter(e=>e.datePrecision==='week'&&e.date<=last&&shift(e.date,6)>=month+'-01'&&shift(e.date,6)>=since);
  const records=activities.filter(e=>e.date.startsWith(month)&&e.date>=since),byDay=new Map();
  for(const entry of records){if(!byDay.has(entry.date))byDay.set(entry.date,[]);byDay.get(entry.date).push(entry);}
  const days=[];for(let day=month+'-01';day<=last;day=shift(day,1))days.push({date:day,day:Number(day.slice(-2)),outside:day<since,future:day>today,records:byDay.get(day)||[]});
  const weeks=[];for(let day=planWeekDates(month+'-01')[0];day<=last&&day<=today;day=shift(day,7))if(shift(day,6)>=since)weeks.push(consistencyWeek(state,day,today));
  return {month,offset:(first.getDay()+6)%7,days,records,weeklyRecords,weeks,activeDays:byDay.size,activeWeeks:weeks.filter(w=>w.active).length,goalWeeks:weeks.filter(w=>w.goalMet).length,solo:records.filter(e=>e.together!==true).length,joint:records.filter(isJointTraining).length};
}
