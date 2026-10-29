import { DEFAULT_SETTINGS } from './domain.mjs';

export const emptyDiary = () => ({version:1,entries:[],settings:{...DEFAULT_SETTINGS,modules:[...DEFAULT_SETTINGS.modules]},onboardingComplete:false});
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
  for(const key of Object.keys(DEFAULT_SETTINGS)) settings[key]=mergeValue(base.settings[key]??DEFAULT_SETTINGS[key],local.settings[key]??DEFAULT_SETTINGS[key],remote.settings[key]??DEFAULT_SETTINGS[key]);
  return {version:1,entries,settings,onboardingComplete:local.onboardingComplete||remote.onboardingComplete};
}
