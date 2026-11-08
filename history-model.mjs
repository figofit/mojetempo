import {calendarDay} from './schedule-rules.mjs';

/** Reconstructed aggregates are metadata, never generated diary entries. */
export function normalizeTrainingHistory(input) {
  if(input==null)return null;
  const text=(v,n)=>typeof v==='string'&&v.length<=n;
  if(!input||!calendarDay(input.startDate)||!calendarDay(input.through)||input.startDate>input.through||!['probable','confirmed'].includes(input.startCertainty)||!Number.isSafeInteger(input.total)||input.total<1||input.total>1000000||!text(input.coach,100)||!text(input.client,100)||!text(input.source,4000))throw new Error('Historie potřebuje platné období, zdroj a ověřený celkový počet.');
  const first=Number(input.startDate.slice(0,4)),last=Number(input.through.slice(0,4));
  if(!Array.isArray(input.years)||input.years.length!==last-first+1||input.years.length>100)throw new Error('Roční součty musí pokrýt každý rok historického období.');
  const years=[...input.years].sort((a,b)=>a.year-b.year).map((row,index)=>{
    if(!row||row.year!==first+index||!Number.isSafeInteger(row.count)||row.count<0||row.count>1000000)throw new Error('Každý rok potřebuje nezáporný celý počet tréninků.');
    return {year:row.year,count:row.count};
  });
  if(years.reduce((sum,row)=>sum+row.count,0)!==input.total)throw new Error('Součet ročních údajů musí odpovídat ověřenému historickému celku.');
  let cooperation=null;
  if(input.cooperation!=null){
    const value=input.cooperation,length=last-first+(input.through.slice(5)>=input.startDate.slice(5)?1:0);
    if(!value||!['estimated','confirmed'].includes(value.certainty)||!text(value.source,4000)||!value.source.trim()||!Array.isArray(value.years)||value.years.length!==length)throw new Error('Roky spolupráce potřebují zdroj, přesnost a součet pro každé výroční období.');
    const rows=[...value.years].sort((a,b)=>a.year-b.year).map((row,i)=>{
      if(!row||row.year!==i+1||!Number.isSafeInteger(row.count)||row.count<0||row.count>1000000)throw new Error('Každý rok spolupráce potřebuje nezáporný celý počet.');
      return {year:row.year,count:row.count};
    });
    if(rows.reduce((n,row)=>n+row.count,0)!==input.total)throw new Error('Součet roků spolupráce musí odpovídat historickému celku.');
    cooperation={certainty:value.certainty,source:value.source,years:rows};
  }
  const highlights=input.highlights??[];
  if(!Array.isArray(highlights)||highlights.length>12)throw new Error('Historie může obsahovat nejvýše 12 poznámek k doloženým údajům.');
  const ids=new Set();
  const notes=highlights.map(note=>{
    if(!note||!/^history-[a-z0-9-]{1,60}$/.test(note.id)||ids.has(note.id)||!text(note.title,160)||!note.title.trim()||!text(note.summary,1000)||!text(note.detail,4000)||!Array.isArray(note.records??[])||(note.records??[]).length>60)throw new Error('Neplatná historická poznámka.');
    ids.add(note.id);const days=new Set();
    const records=(note.records??[]).map(record=>{
      if(!record||!calendarDay(record.date)||record.date<input.startDate||record.date>input.through||days.has(record.date)||!Number.isSafeInteger(record.number)||record.number<1||record.number>input.total)throw new Error('Kalendářní kontrolní bod potřebuje skutečné datum a platné pořadí.');
      days.add(record.date);return {date:record.date,number:record.number};
    }).sort((a,b)=>a.date.localeCompare(b.date));
    return {id:note.id,title:note.title,summary:note.summary,detail:note.detail,records};
  });
  return {startDate:input.startDate,startCertainty:input.startCertainty,through:input.through,total:input.total,coach:input.coach,client:input.client,source:input.source,years,highlights:notes,...(input.cooperation!==undefined?{cooperation}:{})};
}
