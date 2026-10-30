import schema from '../migrations/0001_accounts.sql';
import { DEFAULT_SETTINGS, MODULES, validateEntry, strengthTargets, librarySettings } from '../domain.mjs';
import { emptyDiary } from '../sync-rules.mjs';
import { planningSettings } from '../planning.mjs';
import { habitSettings } from '../habits.mjs';
import { accountRole, publicAccount, accountOverview } from './admin.mjs';
import { invitationFor, publicInvitation, applyInvitation } from './invitations.mjs';

const enc=new TextEncoder();
const COOKIE='__Host-tempo-session', LOCAL_COOKIE='tempo-local-session';
const TTL=14*24*60*60*1000;
const MAX_STATE=1_500_000, MAX_PHOTO=1_000_000, PHOTO_QUOTA=40_000_000;
const ids=/^[a-zA-Z0-9_-]{1,128}$/;
const initialized=new WeakMap();
class APIError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail=(status,message)=>{throw new APIError(status,message);};
const hex=buffer=>Array.from(new Uint8Array(buffer),n=>n.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const binary=value=>Array.isArray(value)?new Uint8Array(value):value;
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',typeof value==='string'?enc.encode(value):binary(value)));
async function passwordHash(password,salt) {
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256));
}
function equal(a,b){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function cookieName(request){return new URL(request.url).protocol==='https:'?COOKIE:LOCAL_COOKIE;}
function cookie(request,token,age=TTL/1000){return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
function json(data,status=200,extra={}) {
  return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin',...extra}});
}
async function initialize(db) {
  if(!initialized.has(db)) initialized.set(db,db.batch(schema.split(';').map(sql=>sql.trim()).filter(Boolean).map(sql=>db.prepare(sql))).catch(error=>{initialized.delete(db);throw error;}));
  await initialized.get(db);
}
async function body(request,limit=8192) {
  const bytes=await readLimited(request,limit);
  try {const result=JSON.parse(new TextDecoder().decode(bytes));if(!result||typeof result!=='object'||Array.isArray(result))fail(400,'Neplatný požadavek.');return result;}
  catch(error){if(error instanceof APIError)throw error;fail(400,'Neplatný JSON.');}
}
async function readLimited(request,limit) {
  if(Number(request.headers.get('Content-Length'))>limit)fail(413,'Soubor nebo deník překračuje limit účtu.');
  const reader=request.body?.getReader();if(!reader)return new Uint8Array();
  const chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail(413,'Soubor nebo deník překračuje limit účtu.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
}
function credentials(data) {
  const login=String(data.login||'').trim().toLowerCase();
  if(!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,30}$/.test(login)||login.length>254)fail(400,'Zadej platný e-mail.');
  if(typeof data.password!=='string'||data.password.length<12||data.password.length>128)fail(400,'Heslo musí mít 12 až 128 znaků.');
  return {login,password:data.password};
}
async function rate(db,request,kind,subject='',limit=12) {
  const window=Math.floor(Date.now()/900000);
  const ip=request.headers.get('CF-Connecting-IP')||'local';
  const keys=[`${kind}:ip:${await digest(ip)}`];if(subject)keys.push(`${kind}:login:${await digest(subject)}`);
  for(const key of keys) {
    const row=await db.prepare('INSERT INTO rate_limits(key,window,attempts) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window=excluded.window THEN attempts+1 ELSE 1 END, window=excluded.window RETURNING attempts').bind(key,window).first();
    if(row.attempts>limit)fail(429,'Příliš mnoho pokusů. Zkus to prosím za 15 minut.');
  }
  await db.prepare('DELETE FROM rate_limits WHERE window < ?').bind(window-2).run();
}
async function session(db,request) {
  const token=(request.headers.get('Cookie')||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(`${cookieName(request)}=`))?.split('=')[1];
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  return db.prepare('SELECT accounts.id,accounts.login FROM sessions JOIN accounts ON accounts.id=sessions.account_id WHERE token_hash=? AND expires_at>?').bind(await digest(token),Date.now()).first();
}
async function createSession(db,request,account) {
  const token=random();
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(Date.now()),
    db.prepare('INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)').bind(await digest(token),account.id,Date.now()+TTL),
  ]);
  return cookie(request,token);
}
function validateState(input) {
  if(!input||input.version!==1||!Array.isArray(input.entries)||input.entries.length>10000||!input.settings)fail(400,'Neplatný formát deníku.');
  const settings={...DEFAULT_SETTINGS},limits={weeklyMinutes:10080,weeklySessions:100,weeklyRecovery:100,dailySteps:200000};
  if(input.settings.name!==undefined) {
    if(typeof input.settings.name!=='string'||!input.settings.name.trim()||input.settings.name.trim().length>80)fail(400,'Jméno v deníku může mít 1 až 80 znaků.');
    settings.name=input.settings.name.trim();
  }
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
  for(const [key,max] of Object.entries(limits)){const value=input.settings[key];if(!Number.isInteger(value)||value<1||value>max)fail(400,'Neplatný cíl.');settings[key]=value;}
  try {Object.assign(settings,strengthTargets(input.settings),librarySettings(input.settings),planningSettings(input.settings,today),habitSettings(input.settings,today));}catch(error){fail(400,error.message);}
  if(!Array.isArray(input.settings.modules)||input.settings.modules.some(id=>!MODULES.some(m=>m.id===id)))fail(400,'Neplatné moduly.');
  settings.modules=[...new Set(input.settings.modules)];
  const used=new Set(),entries=input.entries.map(entry=>{
    if(!entry||!ids.test(entry.id)||used.has(entry.id)||entry.photoId&&!ids.test(entry.photoId))fail(400,'Neplatný nebo opakovaný identifikátor.');
    if(typeof entry.createdAt!=='string'||entry.createdAt.length>40||!Number.isFinite(Date.parse(entry.createdAt)))fail(400,'Neplatný čas záznamu.');
    used.add(entry.id);const result=validateEntry(entry,today);if(!result.valid)fail(400,result.errors.join(' '));return result.entry;
  });
  return {version:1,entries,settings,onboardingComplete:!!input.onboardingComplete};
}
function imageType(bytes) {
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(hex(bytes.slice(0,8))==='89504e470d0a1a0a')return 'image/png';
  if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return 'image/webp';
  fail(400,'Nepodporovaná fotografie.');
}
async function api(request,env) {
  const path=new URL(request.url).pathname,method=request.method;
  if(!['GET','POST','PUT','DELETE'].includes(method))return json({error:'Nepodporovaná metoda.'},405);
  if(method!=='GET') {
    if(request.headers.get('Origin')!==new URL(request.url).origin)fail(403,'Požadavek musí přijít z aplikace Moje tempo.');
    if(!path.startsWith('/api/photos/')&&!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'Je vyžadován JSON.');
  }
  if(path==='/api/status'&&method==='GET')return json({available:!!env.DB});
  if(!env.DB)fail(503,'Databáze zatím není připojená. Místní deník funguje dál.');
  const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
  await initialize(env.DB);
  if(path==='/api/session'&&method==='GET')return json({user:publicAccount(await session(db,request),env)});
  if(path==='/api/invitation/preview'&&method==='POST') {
    await rate(db,request,'invitation-preview','',30);
    const {code}=await body(request);
    const {invitation,claim}=await invitationFor(code,{db,digest,fail});
    return json(publicInvitation(invitation,claim,await session(db,request)));
  }
  if(['/api/register','/api/login','/api/recover'].includes(path)&&method==='POST') {
    const data=await body(request);const {login,password}=credentials(data);
    await rate(db,request,path,login,path==='/api/register'?4:12);
    if(path==='/api/register') {
      const recoveryCode=random(),salt=random(),account={id:crypto.randomUUID(),login};
      if(await db.prepare('SELECT id FROM accounts WHERE login=?').bind(login).first())fail(409,'Účet nelze vytvořit. Pokud už existuje, přihlas se nebo použij obnovovací klíč.');
      const hash=await passwordHash(password,salt);
      try {await db.batch([
        db.prepare('INSERT INTO accounts(id,login,password_hash,salt,recovery_hash,created_at) VALUES(?,?,?,?,?,?)').bind(account.id,login,hash,salt,await digest(recoveryCode),Date.now()),
        db.prepare('INSERT INTO diaries(account_id,state,updated_at) VALUES(?,?,?)').bind(account.id,JSON.stringify(emptyDiary()),Date.now()),
      ]);}catch(error){if(String(error).includes('UNIQUE'))fail(409,'Účet už existuje.');throw error;}
      return json({user:publicAccount(account,env),recoveryCode},201,{'Set-Cookie':await createSession(db,request,account)});
    }
    const account=await db.prepare('SELECT * FROM accounts WHERE login=?').bind(login).first();
    if(path==='/api/recover') {
      const code=String(data.recoveryCode||'');
      if(!account||!equal(await digest(code),account.recovery_hash))fail(401,'E-mail nebo obnovovací klíč nesouhlasí.');
      const salt=random(),recoveryCode=random(),hash=await passwordHash(password,salt);
      const changed=await db.batch([
        db.prepare('UPDATE accounts SET password_hash=?,salt=?,recovery_hash=? WHERE id=? AND recovery_hash=?').bind(hash,salt,await digest(recoveryCode),account.id,account.recovery_hash),
        db.prepare('DELETE FROM sessions WHERE account_id=?').bind(account.id),
      ]);
      if(!changed[0].meta.changes)fail(409,'Klíč už byl použit.');
      return json({user:publicAccount(account,env),recoveryCode},200,{'Set-Cookie':await createSession(db,request,account)});
    }
    const hash=await passwordHash(password,account?.salt||'unknown-account-timing-padding');
    if(!account||!equal(hash,account.password_hash))fail(401,'E-mail nebo heslo nesouhlasí.');
    return json({user:publicAccount(account,env)},200,{'Set-Cookie':await createSession(db,request,account)});
  }
  const account=await session(db,request);if(!account)fail(401,'Přihlas se znovu. Neodeslané zápisy zůstávají na tomto zařízení.');
  if(request.headers.get('X-Tempo-Account')!==account.id)fail(409,'Přihlášení se změnilo v jiné kartě. Obnov stránku nebo se znovu přihlas.');
  if(path==='/api/invitation/accept'&&method==='POST') {
    if(accountRole(account,env)==='admin')fail(403,'Tuto pozvánku přijmi v osobním účtu pozvaného člověka, nikoliv v účtu správce.');
    await rate(db,request,'invitation-accept',account.id,12);
    const {code}=await body(request);
    const {invitation,claim}=await invitationFor(code,{db,digest,fail});
    return json(await applyInvitation(db,account,invitation,claim,{validateState,fail}));
  }
  if(path==='/api/admin/overview'&&method==='GET') {
    if(accountRole(account,env)!=='admin')fail(403,'Přehled je dostupný pouze správci aplikace.');
    const offset=Number(new URL(request.url).searchParams.get('offset')||0);
    if(!Number.isSafeInteger(offset)||offset<0||offset>1_000_000)fail(400,'Neplatná stránka přehledu.');
    await rate(db,request,'admin-read',account.id,120);
    return json(await accountOverview(db,offset,env));
  }
  if(path==='/api/logout'&&method==='POST') {
    const token=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName(request)}=`))?.split('=')[1];
    if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
    return json({ok:true},200,{'Set-Cookie':cookie(request,'',0)});
  }
  if(path==='/api/diary'&&method==='GET') {
    const row=await db.prepare('SELECT revision,state FROM diaries WHERE account_id=?').bind(account.id).first();
    return json({revision:row.revision,state:JSON.parse(row.state)});
  }
  if(path==='/api/diary'&&method==='PUT') {
    await rate(db,request,'write',account.id,180);
    const data=await body(request,MAX_STATE+100),state=validateState(data.state),serialized=JSON.stringify(state);
    if(enc.encode(serialized).length>MAX_STATE)fail(413,'Deník účtu překročil 1,5 MB. Stáhni si zálohu.');
    if(!Number.isSafeInteger(data.revision)||data.revision<0)fail(400,'Neplatná verze deníku.');
    const photos=await db.prepare('SELECT id FROM photos WHERE account_id=?').bind(account.id).all();
    const available=new Set(photos.results.map(p=>p.id));
    if(state.entries.some(entry=>entry.photoId&&!available.has(entry.photoId)))fail(400,'Nejdříve nahraj všechny fotografie.');
    const row=await db.prepare('UPDATE diaries SET state=?,revision=revision+1,updated_at=? WHERE account_id=? AND revision=? RETURNING revision').bind(serialized,Date.now(),account.id,data.revision).first();
    if(!row)fail(409,'Deník se mezitím změnil na jiném zařízení.');
    // Remove only old unreferenced uploads. Another device may be uploading a new entry.
    await db.prepare("DELETE FROM photos WHERE account_id=? AND created_at<? AND id NOT IN (SELECT json_extract(value,'$.photoId') FROM json_each(?) WHERE json_extract(value,'$.photoId') IS NOT NULL)").bind(account.id,Date.now()-86400000,JSON.stringify(state.entries)).run();
    return json({revision:row.revision,state});
  }
  const photoMatch=path.match(/^\/api\/photos\/([a-zA-Z0-9_-]{1,128})$/);
  if(photoMatch) {
    const id=photoMatch[1];
    if(method==='GET') {
      const photo=await db.prepare('SELECT mime,bytes FROM photos WHERE account_id=? AND id=?').bind(account.id,id).first();
      if(!photo)fail(404,'Fotografie nebyla nalezena.');
      return new Response(binary(photo.bytes),{headers:{'Content-Type':photo.mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
    }
    if(method==='PUT') {
      await rate(db,request,'photo',account.id,180);
      const bytes=await readLimited(request,MAX_PHOTO),mime=imageType(bytes);
      const existing=await db.prepare('SELECT bytes FROM photos WHERE account_id=? AND id=?').bind(account.id,id).first();
      if(existing){if(!equal(await digest(bytes),await digest(existing.bytes)))fail(409,'Fotografie má jiný obsah.');return json({ok:true});}
      const result=await db.prepare('INSERT INTO photos(account_id,id,mime,bytes,created_at) SELECT ?,?,?,?,? WHERE (SELECT COALESCE(SUM(length(bytes)),0) FROM photos WHERE account_id=?) + ? <= ?').bind(account.id,id,mime,bytes.buffer,Date.now(),account.id,bytes.length,PHOTO_QUOTA).run();
      if(!result.meta.changes)fail(413,'Účet má zaplněný prostor pro fotografie (40 MB).');
      return json({ok:true},201);
    }
  }
  fail(404,'Požadovaná funkce neexistuje.');
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) {
      url.protocol='https:';return Response.redirect(url.href,308);
    }
    if(new URL(request.url).pathname.startsWith('/api/')) {
      try{return await api(request,env);}
      catch(error){if(!(error instanceof APIError))console.error('Moje tempo API error',error?.name);return json({error:error instanceof APIError?error.message:'Server požadavek nedokončil. Tvoje místní data zůstávají uložená.'},error.status||503);}
    }
    return env.ASSETS.fetch(request);
  },
};
