const key=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const today=()=>key(new Date());
export function calendarDay(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01')return null;
  const date=new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime())&&key(date)===value?date:null;
}
const dayNumber=value=>{const date=calendarDay(value);return Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/86400000;};

export function scheduleSettings(input={},reference=today()) {
  const since=input.trainingSince===undefined?'':input.trainingSince;
  if(!calendarDay(reference)||typeof since!=='string'||since&&(!calendarDay(since)||since>reference))throw new Error('Začátek cvičení musí být dnešní nebo minulé datum.');
  const periods=input.restPeriods===undefined?[]:input.restPeriods;
  if(!Array.isArray(periods)||periods.length>100)throw new Error('Uložit lze nejvýše 100 období volnějšího režimu.');
  const used=new Set(),restPeriods=periods.map(period=>{
    if(!period||typeof period.id!=='string'||!/^pause-[A-Za-z0-9-]{1,80}$/.test(period.id)||used.has(period.id)||!calendarDay(period.start)||!calendarDay(period.end)||period.end<period.start||dayNumber(period.end)-dayNumber(period.start)>365||typeof period.label!=='string'||!period.label.trim()||period.label.trim().length>80)throw new Error('Volnější režim potřebuje název a platné období nejvýše jednoho roku.');
    used.add(period.id);return {id:period.id,start:period.start,end:period.end,label:period.label.trim()};
  });
  const sorted=[...restPeriods].sort((a,b)=>a.start.localeCompare(b.start));
  if(sorted.some((period,index)=>index&&period.start<=sorted[index-1].end))throw new Error('Období volnějšího režimu se nemohou překrývat.');
  return {trainingSince:since,restPeriods};
}
export const activeRest=(settings,date=today())=>(settings.restPeriods||[]).find(period=>period.start<=date&&period.end>=date)||null;

export function trainingAge(start,end=today()) {
  const first=calendarDay(start),last=calendarDay(end);
  if(!first||!last||start>end)return null;
  let months=(last.getFullYear()-first.getFullYear())*12+last.getMonth()-first.getMonth();
  const anniversary=count=>{
    const year=first.getFullYear()+Math.floor((first.getMonth()+count)/12),month=(first.getMonth()+count)%12;
    return new Date(year,month,Math.min(first.getDate(),new Date(year,month+1,0).getDate()),12);
  };
  if(anniversary(months)>last)months--;
  const anchor=anniversary(months);
  return {years:Math.floor(months/12),months:months%12,days:dayNumber(end)-dayNumber(key(anchor)),totalMonths:months,totalDays:dayNumber(end)-dayNumber(start)};
}

export function endRest(settings,id,date=today()) {
  const previous=calendarDay(date);if(!previous)throw new Error('Neplatné datum.');
  previous.setDate(previous.getDate()-1);
  return scheduleSettings({...settings,restPeriods:(settings.restPeriods||[]).flatMap(period=>period.id!==id?[period]:period.start>=date?[]:[{...period,end:key(previous)}])},date);
}
