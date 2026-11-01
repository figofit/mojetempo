// One-time conversion. The complete original JSON is archived separately in D1.
import {createHash} from 'node:crypto';
import {emptyDiary} from './sync-rules.mjs';
import {validateEntry} from './domain.mjs';
import {personalSettings} from './personal.mjs';
const stable=(kind,id)=>`olda-${kind}-${createHash('sha256').update(String(id)).digest('hex').slice(0,32)}`;
export function convertOldaBoard(board,existing=emptyDiary()) {
  if(board?.schemaVersion!==1||board.clientId!=='olda-4-0'||!board.profile||!board.plan||!['habits','sessions','days','milestones'].every(key=>Array.isArray(board[key])))throw new Error('Neplatný původní Oldův export.');
  const state=structuredClone(existing),before=new Map(state.entries.map(e=>[e.id,e]));
  const settings=state.settings;
  const habitId=id=>stable('habit',id).replace('olda-habit-','custom-olda-');
  const sourceHabits=board.habits.map(h=>({...h,id:habitId(h.id)}));
  settings.customHabits=[...(settings.customHabits||[]).filter(h=>!sourceHabits.some(x=>x.id===h.id)),...sourceHabits];
  settings.habits=[...new Set([...settings.habits,...sourceHabits.filter(h=>!h.archived).map(h=>h.id)])];
  const checks=board.days.flatMap(d=>d.habits.map(id=>({id:`${d.date}:${habitId(id)}`,date:d.date,habitId:habitId(id)})));
  settings.habitChecks=[...(settings.habitChecks||[]).filter(c=>!checks.some(x=>x.id===c.id)),...checks];
  settings.personalPlan=structuredClone(board.plan);
  settings.personalProfile=structuredClone(board.profile);delete settings.personalProfile.startDate;
  if(board.profile.startDate)settings.trainingSince=board.profile.startDate;
  settings.name=board.profile.name;
  const add=entry=>{
    const normalized=validateEntry(entry);
    if(!normalized.valid)throw new Error(`Převod ${entry.id}: ${normalized.errors.join(' ')}`);
    if(!before.has(entry.id))state.entries.push(normalized.entry);
  };
  const made=date=>board.updatedAt||`${date}T12:00:00.000Z`;
  for(const session of board.sessions) {
    const entry={id:stable('session',session.id),type:({walk:'walking',other:'home'})[session.category]||session.category,date:session.date,title:session.title,duration:session.minutes,durationUnknown:session.minutes===0,together:session.together,note:session.note,createdAt:made(session.date)};
    const exercises=session.exercises.map(e=>({pattern:'other',name:e.name,sets:e.sets,...(!e.sets?{setsUnknown:true}:{}),reps:e.reps,weight:e.weight}));
    if(exercises.length){if(['strength','home'].includes(entry.type))entry.workout={focus:'unspecified',splitName:'',exercises};else entry.exerciseDetails=exercises;}
    add(entry);
  }
  for(const day of board.days)add({id:stable('day',day.date),type:'day',date:day.date,title:'Denní zápis',duration:0,steps:day.steps??0,energy:day.energy,note:day.note,createdAt:made(day.date)});
  for(const milestone of board.milestones)add({id:stable('milestone',milestone.id),type:'moment',date:milestone.date,title:milestone.title,duration:0,note:milestone.note,createdAt:made(milestone.date)});
  Object.assign(settings,personalSettings(settings));
  state.onboardingComplete=true;
  return {state,preview:{sessions:board.sessions.length,days:board.days.length,milestones:board.milestones.length,habits:board.habits.length,planExercises:board.plan.exercises.length,added:state.entries.length-existing.entries.length}};
}
