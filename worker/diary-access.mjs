// Delegation is scoped to one physical diary. Admin status alone grants no access.
export async function diaryAccess(db,account,request,env,fail) {
  const selected=request.headers.get('X-Tempo-Diary')||env.OLDA_DIARY||'';
  if(!selected)return {id:account.id,ownerId:account.id,mode:'owner'};
  if(selected!=='olda')fail(403,'Tento deník není dostupný.');
  const row=await db.prepare('SELECT owner_id,coach_id FROM diary_links WHERE id=?').bind(selected).first();
  if(!row||![row.owner_id,row.coach_id].includes(account.id))fail(403,'Tento účet nemá přístup k Oldovu deníku.');
  return {id:selected,ownerId:row.owner_id,mode:account.id===row.owner_id?'owner':'coach'};
}
export async function availableDiaries(db,account) {
  if(!account)return [];
  const rows=await db.prepare('SELECT id,owner_id,coach_id FROM diary_links WHERE owner_id=? OR coach_id=?').bind(account.id,account.id).all();
  return rows.results.map(row=>({id:row.id,ownerId:row.owner_id,mode:row.owner_id===account.id?'owner':'coach'}));
}
