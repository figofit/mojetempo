import configuration from '../invitations.config.json' with {type:'json'};
import {DEFAULT_SETTINGS,validateEntry} from '../domain.mjs';
const bytes=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));

export async function invitationFor(code,{db,digest,fail,now=Date.now()}) {
  if(typeof code!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(code))fail(404,'Pozvánka není platná.');
  const hash=await digest(code),record=configuration.find(item=>item.tokenHash===hash);
  if(!record)fail(404,'Pozvánka není platná.');
  if(!Number.isFinite(Date.parse(record.expiresAt))||Date.parse(record.expiresAt)<now)fail(410,'Platnost pozvánky skončila.');
  let payload;
  try {
    // Separate derivation domain: the public token hash cannot decrypt the payload.
    const secret=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('moje-tempo-invitation:'+code));
    const key=await crypto.subtle.importKey('raw',secret,'AES-GCM',false,['decrypt']);
    const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(record.payload.iv)},key,bytes(record.payload.data));
    payload=JSON.parse(new TextDecoder().decode(decrypted));
    if(typeof payload.name!=='string'||!payload.name.trim()||payload.name.length>80||typeof payload.milestone?.date!=='string'||typeof payload.milestone?.title!=='string')throw new Error('Invalid invitation payload');
  }catch{fail(410,'Pozvánku se nepodařilo otevřít. Vyžádej si nový odkaz.');}
  const invitation={...record,name:payload.name,milestone:payload.milestone};
  const claim=await db.prepare('SELECT account_id,applied_at FROM invitation_claims WHERE invitation_id=?').bind(invitation.id).first();
  return {invitation,claim};
}

export function publicInvitation(invitation,claim,account) {
  const own=claim&&account&&claim.account_id===account.id;
  return {name:invitation.name,milestone:{date:invitation.milestone.date,title:invitation.milestone.title},available:!claim||!!own&&!claim.applied_at,alreadyApplied:!!own&&!!claim.applied_at,expiresAt:invitation.expiresAt};
}

/** A one-time invitation adds an initial moment; never replaces an existing diary. */
export async function applyInvitation(db,account,invitation,claim,{validateState,fail}) {
  if(claim&&claim.account_id!==account.id)fail(409,'Pozvánka už byla použitá pro jiný účet.');
  if(claim?.applied_at)return {ok:true,alreadyApplied:true};
  const row=await db.prepare('SELECT revision,state FROM diaries WHERE account_id=?').bind(account.id).first();
  if(!row)fail(409,'Deník účtu není připravený. Přihlas se znovu.');
  const state=JSON.parse(row.state),id=`invite-${invitation.id}`,now=Date.now();
  if(!state.entries.some(entry=>entry.id===id)) {
    const result=validateEntry({...invitation.milestone,id,type:'moment',duration:0,steps:0,createdAt:new Date(now).toISOString()},new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date()));
    if(!result.valid)fail(400,'Milník v pozvánce není platný.');
    if(!state.entries.length&&state.settings.name===DEFAULT_SETTINGS.name)state.settings.name=invitation.name;
    state.entries.push(result.entry);
  }
  state.settings.modules=[...new Set([...state.settings.modules,'chronicle'])];
  state.onboardingComplete=true;
  const serialized=JSON.stringify(validateState(state));
  if(new TextEncoder().encode(serialized).length>1_500_000)fail(413,'Deník je zaplněný. Nejprve si stáhni zálohu.');
  const result=await db.batch([
    db.prepare('INSERT INTO invitation_claims(invitation_id,account_id,claimed_at) VALUES(?,?,?) ON CONFLICT(invitation_id) DO NOTHING').bind(invitation.id,account.id,now),
    db.prepare('UPDATE diaries SET state=?,revision=revision+1,updated_at=? WHERE account_id=? AND revision=? AND EXISTS(SELECT 1 FROM invitation_claims WHERE invitation_id=? AND account_id=?)').bind(serialized,now,account.id,row.revision,invitation.id,account.id),
  ]);
  if(!result[1].meta.changes)fail(409,'Pozvánku se nepodařilo vložit. Synchronizuj deník a zkus to znovu.');
  await db.prepare('UPDATE invitation_claims SET applied_at=? WHERE invitation_id=? AND account_id=?').bind(now,invitation.id,account.id).run();
  return {ok:true,alreadyApplied:false};
}
