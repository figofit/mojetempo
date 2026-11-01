/** Local diary plus a separate, per-account offline cache and versioned cloud sync. */
import * as local from './local-storage.mjs';
import { emptyDiary, mergeDiaries, same } from './sync-rules.mjs';

const requestedDiary=new URL(location.href).searchParams.get('denik')||document.querySelector('meta[name="tempo-diary"]')?.content||'';
const scope=requestedDiary==='olda'?'olda':'';
let user=null,diary=null,diaries=[],available=false,syncing=null,status='Místní deník',timer;
const listeners=new Set();
const key=id=>`account:${id}${scope?':diary:'+scope:''}`;
const photoKey=(id,owner=user?.id)=>owner?`${key(owner)}:${id}`:id;
const emit=()=>listeners.forEach(fn=>fn(getAccount()));
export const getAccount=()=>({user,available,status,diary,diaries,scope});
export const onAccountChange=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export class APIError extends Error {constructor(status,message){super(message);this.status=status;}}
async function request(path,options={}) {
  const response=await fetch(new URL(`api/${path}`,import.meta.url),{...options,credentials:'same-origin',cache:'no-store',headers:{...(user?{'X-Tempo-Account':user.id}:{}),...(scope?{'X-Tempo-Diary':scope}:{}),...(options.body&&typeof options.body==='string'?{'Content-Type':'application/json'}:{}),...options.headers}});
  if(!response.ok){let data;try{data=await response.json();}catch{}throw new APIError(response.status,data?.error||'Server není dostupný. Zápisy zůstávají na tomto zařízení.');}
  return response;
}
const api=async(path,options)=> (await request(path,options)).json();
export const loadAdminOverview=(offset=0)=>api(`admin/overview?offset=${encodeURIComponent(offset)}`);
export const previewInvitation=code=>api('invitation/preview',{method:'POST',body:JSON.stringify({code})});
export async function acceptInvitation(code) {
  if(!user)throw new Error('Nejdříve si vytvoř účet nebo se přihlas.');
  const owner=user.id;
  await syncCloud();
  if(user?.id!==owner)throw new Error('Přihlášení se změnilo. Otevři pozvánku znovu.');
  const result=await api('invitation/accept',{method:'POST',body:JSON.stringify({code})});
  await syncCloud();
  return result;
}
export async function initializeAccount() {
  const previous=await local.getValue('active-account');
  try {
    const result=await api('status');available=result.available;
    const resultSession=available?await api('session'):{};
    user=resultSession.user||null;diary=resultSession.diary||null;diaries=resultSession.diaries||[];
    await local.setValue('diary-access:'+scope,diary);
    await local.setValue('active-account',user);
  } catch {user=previous;available=!!previous;diary=await local.getValue('diary-access:'+scope);}
  status=user?'Čeká na synchronizaci':'Místní deník';emit();
  if(user)await syncCloud().catch(()=>{});
}
export async function authenticate(mode,data) {
  if(syncing)await syncing.catch(()=>{});
  const result=await api(mode,{method:'POST',body:JSON.stringify(data)});
  user=result.user;available=true;
  await local.setValue('active-account',user);
  status='Čeká na synchronizaci';emit();
  await syncCloud().catch(()=>{});
  return result;
}
export async function logout() {
  if(syncing)await syncing.catch(()=>{});
  if(!navigator.onLine)throw new Error('Pro bezpečné odhlášení se připoj k internetu.');
  await api('logout',{method:'POST',body:'{}'}).catch(error=>{if(error.status!==401)throw error;});
  user=null;diary=null;diaries=[];await local.setValue('active-account',null);await local.setValue('diary-access:'+scope,null);status='Místní deník';emit();
}
export async function loadState() {
  if(scope&&(!user||!diary))return emptyDiary();
  if(!user)return local.loadState();
  return (await local.getValue(key(user.id)))?.state??emptyDiary();
}
export async function updateState(mutator) {
  if(scope&&(!user||!diary))throw new Error('Přihlas se k účtu s přístupem k Oldovu deníku.');
  if(!user)return local.updateState(mutator);
  const owner=user.id;
  const result=await local.mutateValue(key(owner),current=>{
    current=current||{state:emptyDiary(),base:emptyDiary(),revision:0};
    const next=mutator(structuredClone(current.state));
    if(!next||!Array.isArray(next.entries)||typeof next.then==='function')throw new TypeError('Neplatný deník.');
    return {...current,state:next,dirty:true};
  });
  schedule();return result.state;
}
export async function saveState(state) {return updateState(()=>state);}
export async function savePhoto(id,blob) {
  if(user&&blob.size>1_000_000)throw new Error('Fotografie pro účet musí být do 1 MB. Vyber menší obrázek.');
  return local.savePhoto(photoKey(id),blob);
}
export async function getPhoto(id) {
  const owner=user?.id,stored=await local.getPhoto(photoKey(id,owner));
  if(stored||!owner)return stored;
  const blob=await (await request(`photos/${encodeURIComponent(id)}`,{headers:{'X-Tempo-Account':owner}})).blob();
  await local.savePhoto(photoKey(id,owner),blob);return blob;
}
export async function deletePhoto(id) {return local.deletePhoto(photoKey(id));}
function schedule(){clearTimeout(timer);status='Čeká na odeslání';emit();timer=setTimeout(()=>syncCloud().catch(()=>{}),500);}
export async function syncCloud() {
  if(!user)return;
  if(syncing)return syncing;
  const owner=user.id;
  const work=async()=>{
    if(user?.id!==owner)return;
    status='Synchronizuji…';emit();
    try {
      let attempts=0;
      while(attempts++<5) {
        // A cookie might belong to a different account after a login in another tab.
        const currentSession=await api('session'),actual=currentSession.user;
        if(actual?.id!==owner)throw new APIError(401,'Přihlášení se změnilo. Přihlas se znovu ke správnému účtu.');
        diary=currentSession.diary||null;diaries=currentSession.diaries||[];
        await local.setValue('diary-access:'+scope,diary);
        if(scope&&!diary)throw new APIError(403,'Tento účet nemá přístup k Oldovu deníku.');
        if(actual.role!==user.role){user=actual;await local.setValue('active-account',user);}
        const remote=await api('diary');
        const record=await local.mutateValue(key(owner),current=>{
          if(!current)return {state:remote.state,base:remote.state,revision:remote.revision,dirty:false};
          const state=current.dirty?mergeDiaries(current.base,current.state,remote.state):remote.state;
          return {...current,state,base:remote.state,revision:remote.revision,dirty:!same(state,remote.state)};
        });
        if(!record.dirty)break;
        const uploaded=record.uploaded||[];
        for(const id of new Set(record.state.entries.map(entry=>entry.photoId).filter(Boolean))) {
          if(uploaded.includes(id))continue;
          const blob=await local.getPhoto(photoKey(id,owner));
          if(!blob&&record.base.entries.some(entry=>entry.photoId===id))continue;
          if(!blob)throw new Error('Chybí fotografie. Obnov ji z úplné zálohy deníku.');
          await request(`photos/${encodeURIComponent(id)}`,{method:'PUT',body:blob});
          uploaded.push(id);
          await local.mutateValue(key(owner),current=>({...current,uploaded:[...uploaded]}));
        }
        let saved;
        try {saved=await api('diary',{method:'PUT',body:JSON.stringify({revision:record.revision,state:record.state})});}
        catch(error){if(error.status===409)continue;throw error;}
        const next=await local.mutateValue(key(owner),current=>{
          const state=mergeDiaries(record.state,current.state,saved.state);
          return {...current,state,base:saved.state,revision:saved.revision,dirty:!same(state,saved.state)};
        });
        if(!next.dirty)break;
      }
      const pending=(await local.getValue(key(owner)))?.dirty;
      status=pending?'Zbývají neodeslané změny':'Uloženo v účtu';
      if(pending)schedule();
    }catch(error){status=error.status===401?'Přihlas se znovu':!navigator.onLine?'Offline · čeká na připojení':error.message;throw error;}
    finally{emit();}
  };
  syncing=(navigator.locks?navigator.locks.request(`tempo-sync:${owner}`,work):work()).finally(()=>{syncing=null;});
  return syncing;
}
/** Explicit migration: independent local entries are copied, never deleted or silently mixed. */
export async function copyLocalToAccount() {
  if(!user)throw new Error('Nejdříve se přihlas.');
  const diary=await local.loadState();if(!diary?.entries.length)throw new Error('Na této adrese není místní deník k převodu. Ze staré adresy stáhni zálohu a zde ji obnov.');
  const newEntries=[];
  for(const entry of diary.entries){const next={...entry,id:crypto.randomUUID()};if(entry.photoId){const blob=await local.getPhoto(entry.photoId);if(!blob)throw new Error('V místním deníku chybí fotografie.');next.photoId=crypto.randomUUID();await savePhoto(next.photoId,blob);}newEntries.push(next);}
  await updateState(current=>({...current,entries:[...current.entries,...newEntries],settings:current.entries.length?current.settings:diary.settings,onboardingComplete:true}));
  await syncCloud();
}
export async function loadServerVersion() {
  if(!user)return;
  const actual=(await api('session')).user;if(actual?.id!==user.id)throw new Error('Přihlas se znovu.');
  const remote=await api('diary');
  await local.setValue(key(user.id),{state:remote.state,base:remote.state,revision:remote.revision,dirty:false});
  status='Uloženo v účtu';emit();
}
window.addEventListener('online',()=>syncCloud().catch(()=>{}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCloud().catch(()=>{});});
setInterval(()=>{if(user&&!document.hidden&&navigator.onLine)syncCloud().catch(()=>{});},30000);
