import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handoffInvitation,invitationFor} from '../worker/invitations.mjs';

const secret='a'.repeat(64);
const b64url=value=>Buffer.from(value).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
// Same construction as the Moje ITfit WordPress plugin (includes/tempo.php).
function link(payload,key=secret) {
  const body='i1.'+b64url(JSON.stringify(payload));
  return body+'.'+b64url(createHmac('sha256',key).update(body).digest());
}
const now=Date.parse('2026-11-12T10:00:00Z');
const valid={id:'0123456789abcdef0123456789abcdef',name:'Petr',milestone:{date:'2026-11-12',title:'První měsíc s Moje ITfit je za mnou',note:'28 z 28 dní plánu · tréninky A/B: 10 · mobilita 20/28'},exp:now/1000+3600};

test('a signed hand-off becomes an invitation with its own stable id',async()=>{
  const invitation=await handoffInvitation(link(valid),secret,now);
  assert.equal(invitation.id,'itfit-0123456789abcdef0123456789abcdef');
  assert.equal(invitation.name,'Petr');
  assert.equal(invitation.milestone.title,'První měsíc s Moje ITfit je za mnou');
  assert.equal(invitation.expired,false);
});

test('tampered, foreign or malformed links are rejected',async()=>{
  const code=link(valid),[version,body,signature]=code.split('.');
  const forged=version+'.'+b64url(JSON.stringify({...valid,name:'Někdo jiný'}))+'.'+signature;
  assert.equal(await handoffInvitation(forged,secret,now),null);
  assert.equal(await handoffInvitation(link(valid,'b'.repeat(64)),secret,now),null);
  assert.equal(await handoffInvitation(code,undefined,now),null);
  assert.equal(await handoffInvitation(code,'short',now),null);
  assert.equal(await handoffInvitation(body,secret,now),null);
  assert.equal(await handoffInvitation(link({...valid,id:'not-hex'}),secret,now),null);
  assert.equal(await handoffInvitation(link({...valid,milestone:{date:'2026-11-12'}}),secret,now),null);
});

test('expiry and claims are enforced through the shared invitation path',async()=>{
  const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
  const db={prepare:()=>({bind:id=>({first:async()=>id==='itfit-'+valid.id?{account_id:'acc',applied_at:null}:null})})};
  const context={db,fail,secret,now,digest:async()=>''};
  const {invitation,claim}=await invitationFor(link(valid),context);
  assert.equal(invitation.id,'itfit-'+valid.id);
  assert.equal(claim.account_id,'acc');
  await assert.rejects(invitationFor(link({...valid,exp:now/1000-1}),context),{status:410});
  await assert.rejects(invitationFor('i1.zzzzzzzzzzzzzzzzzzzzzzzz.'+'a'.repeat(43),context),{status:404});
  await assert.rejects(invitationFor(link(valid),{...context,secret:undefined}),{status:404});
});
