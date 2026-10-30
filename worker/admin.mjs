// The owner is selected through trusted deployment configuration, never signup order
// or an unverified e-mail address. The UUID is an identifier, not a credential.
const accountId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function accountRole(account,env,configuration=adminConfig) {
  // A present environment binding always wins, including an empty/invalid
  // value used to revoke access. The fallback comes only from the deployment.
  const owner=Object.hasOwn(env||{},'ADMIN_ACCOUNT_ID')?env.ADMIN_ACCOUNT_ID:configuration?.accountId;
  return account&&typeof owner==='string'&&accountId.test(owner)&&account.id===owner?'admin':'user';
}

export function publicAccount(account,env) {
  return account?{id:account.id,login:account.login,role:accountRole(account,env)}:null;
}

/** Account metadata only: do not select diary JSON, health entries, or photo bytes. */
export async function accountOverview(db,offset,env) {
  const totals=await db.prepare('SELECT (SELECT COUNT(*) FROM accounts) AS accounts, (SELECT COUNT(*) FROM diaries WHERE revision>0) AS accountsWithSyncedDiary, (SELECT COALESCE(SUM(length(bytes)),0) FROM photos) AS photoBytes').first();
  const page=await db.prepare('SELECT id,login,created_at AS createdAt FROM accounts ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET ?').bind(offset).all();
  return {totals,users:page.results.slice(0,50).map(user=>({...user,role:accountRole(user,env)})),nextOffset:page.results.length>50?offset+50:null};
}
import adminConfig from '../admin.config.json' with {type:'json'};

