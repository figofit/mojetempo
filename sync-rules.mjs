import { DEFAULT_SETTINGS, librarySettings } from './domain.mjs';
import { planningSettings } from './planning.mjs';
import { HABITS, habitSettings } from './habits.mjs';

export const emptyDiary = () => ({version:1,entries:[],settings:{...DEFAULT_SETTINGS,modules:[...DEFAULT_SETTINGS.modules],favoriteExercises:[],customExercises:[],weeklyPlan:[],planChecks:[],habits:[],habitChecks:[]},onboardingComplete:false});
// Stable equality ignores property insertion order (JSON round trips / old backups).
export function same(a,b) {
  if(a===b) return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object') return false;
  if(Array.isArray(a)!==Array.isArray(b)) return false;
  const keys=Object.keys(a).sort(), other=Object.keys(b).sort();
  return keys.length===other.length&&keys.every((key,i)=>key===other[i]&&same(a[key],b[key]));
}
function mergeValue(base,local,remote) {
  if(same(local,base)) return remote;
  if(same(remote,base)||same(local,remote)) return local;
  throw new Error('Stejný údaj byl změněn na dvou zařízeních. Stáhni zálohu tohoto deníku a načti verzi z účtu.');
}
function mergeCollection(base=[],local=[],remote=[]) {
  const [b,l,r]=[base,local,remote].map(items=>new Map(items.map(item=>[item.id,item]))),output=[];
  for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])) {
    const value=mergeValue(b.get(id),l.get(id),r.get(id));
    if(value)output.push(value);
  }
  return output;
}
/** Three-way merge preserves independent additions and deletions; never guesses on a conflict. */
export function mergeDiaries(base,local,remote) {
  base=base||emptyDiary();local=local||emptyDiary();remote=remote||emptyDiary();
  const map=diary=>new Map(diary.entries.map(entry=>[entry.id,entry]));
  const b=map(base),l=map(local),r=map(remote),entries=[];
  for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])) {
    const entry=mergeValue(b.get(id),l.get(id),r.get(id));
    if(entry) entries.push(entry);
  }
  const settings={};
  for(const key of Object.keys(DEFAULT_SETTINGS)) {
    if(['favoriteExercises','customExercises','weeklyPlan','planChecks','habits','habitChecks'].includes(key))continue;
    settings[key]=mergeValue(base.settings[key]??DEFAULT_SETTINGS[key],local.settings[key]??DEFAULT_SETTINGS[key],remote.settings[key]??DEFAULT_SETTINGS[key]);
  }
  // Collections merge by identity, so favoriting different exercises on two devices
  // does not cause a conflict. Concurrent edits of the same custom exercise still do.
  const libraries=[base,local,remote].map(diary=>librarySettings(diary.settings));
  const [cb,cl,cr]=libraries.map(library=>new Map(library.customExercises.map(exercise=>[exercise.id,exercise])));
  settings.customExercises=[];
  for(const id of new Set([...cb.keys(),...cl.keys(),...cr.keys()])) {
    const exercise=mergeValue(cb.get(id),cl.get(id),cr.get(id));
    if(exercise)settings.customExercises.push(exercise);
  }
  const [fb,fl,fr]=libraries.map(library=>new Set(library.favoriteExercises));
  settings.favoriteExercises=[];
  const removedCustom=new Set([...cb.keys(),...cl.keys(),...cr.keys()].filter(id=>!settings.customExercises.some(exercise=>exercise.id===id)));
  for(const id of new Set([...fb,...fl,...fr]))if(!removedCustom.has(id)&&mergeValue(fb.has(id),fl.has(id),fr.has(id)))settings.favoriteExercises.push(id);
  Object.assign(settings,librarySettings(settings));
  for(const key of ['weeklyPlan','planChecks'])settings[key]=mergeCollection(base.settings[key],local.settings[key],remote.settings[key]);
  Object.assign(settings,planningSettings(settings));
  settings.habits=HABITS.filter(habit=>mergeValue((base.settings.habits||[]).includes(habit.id),(local.settings.habits||[]).includes(habit.id),(remote.settings.habits||[]).includes(habit.id))).map(habit=>habit.id);
  settings.habitChecks=mergeCollection(base.settings.habitChecks,local.settings.habitChecks,remote.settings.habitChecks);
  Object.assign(settings,habitSettings(settings));
  return {version:1,entries,settings,onboardingComplete:local.onboardingComplete||remote.onboardingComplete};
}
