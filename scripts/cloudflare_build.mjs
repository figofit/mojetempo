/** Deploy the same independent app to Pages using the existing Workers Builds credentials.
 * Pages supports an external DNS CNAME; a Workers Custom Domain requires a Cloudflare zone.
 * Local builds and GitHub test jobs only package files and never contact the account API.
 */
import {writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildPublic,preparePages,ROOT} from './build_pages.mjs';

export const PROJECT='figofit-mojetempo';
export const DOMAIN='moje.itfit.cz';
export const DATABASE='mojetempo-db';

export function cloudflareAPI(accountId,token,fetcher=fetch) {
  return async function call(path,method='GET',data) {
    const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(30000)});
    let value;try{value=await response.json();}catch{throw new Error(`Cloudflare API ${method} ${path.split('?')[0]}: HTTP ${response.status}.`);}
    if(!response.ok||value.success===false) {
      const error=new Error(`Cloudflare API ${method} ${path.split('?')[0]}: HTTP ${response.status}, kód ${value.errors?.[0]?.code||'unknown'}. Ověř oprávnění Pages Edit a D1 Edit nasazovacího tokenu.`);
      error.status=response.status;throw error;
    }
    return value.result;
  };
}
export async function ensureProject(api) {
  const databases=await api(`/d1/database?name=${DATABASE}&per_page=100`);
  let database=databases.find(item=>item.name===DATABASE);
  if(!database)database=await api('/d1/database','POST',{name:DATABASE});
  if(!database?.uuid)throw new Error('Cloudflare nevrátilo ID samostatné databáze Moje tempo.');
  let project;
  try{project=await api(`/pages/projects/${PROJECT}`);}catch(error){if(error.status!==404)throw error;}
  const deployment={compatibility_date:'2026-10-29',d1_databases:{DB:{id:database.uuid}}};
  if(!project)project=await api('/pages/projects','POST',{name:PROJECT,production_branch:'main',deployment_configs:{production:deployment,preview:deployment}});
  else if(project.deployment_configs?.production?.d1_databases?.DB?.id!==database.uuid||project.deployment_configs?.preview?.d1_databases?.DB?.id!==database.uuid) {
    project=await api(`/pages/projects/${PROJECT}`,'PATCH',{deployment_configs:{production:deployment,preview:deployment}});
  }
  if(project.name!==PROJECT||project.subdomain!==`${PROJECT}.pages.dev`)throw new Error('Cloudflare vrátilo neočekávaný projekt Pages. Nasazení bylo zastaveno.');
  return {project,database};
}
export async function attachDomain(api) {
  const domains=await api(`/pages/projects/${PROJECT}/domains`);
  if(domains.some(domain=>domain.name===DOMAIN))return;
  await api(`/pages/projects/${PROJECT}/domains`,'POST',{name:DOMAIN});
}
export async function deployPages({accountId,token}) {
  const api=cloudflareAPI(accountId,token);
  const {database}=await ensureProject(api);
  const stage=await preparePages();
  try {
    await writeFile(join(stage.directory,'wrangler.toml'),`name = "${PROJECT}"\npages_build_output_dir = "./public"\ncompatibility_date = "2026-10-29"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${DATABASE}"\ndatabase_id = "${database.uuid}"\n`);
    const cli=join(ROOT,'node_modules/wrangler/bin/wrangler.js');
    // Pages discovers wrangler.toml from cwd and rejects the global --config flag.
    const result=spawnSync(process.execPath,[cli,'pages','deploy',stage.publicDir,'--project-name',PROJECT,'--branch','main','--force'],{cwd:stage.directory,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
    if(result.status!==0)throw new Error('Nasazení Cloudflare Pages selhalo; zkontroluj výše uvedenou chybu Wrangleru.');
    await attachDomain(api);
    console.log(`Moje tempo Pages deployed: https://${PROJECT}.pages.dev/`);
    console.log(`DNS CNAME: moje -> ${PROJECT}.pages.dev ; vlastní doména ${DOMAIN}`);
  }finally{await rm(stage.directory,{recursive:true,force:true});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  buildPublic();
  // WORKERS_CI=1 is the documented service flag, not a user-specific credential.
  if(process.env.WORKERS_CI==='1') {
    const accountId=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
    if(!accountId||!token)throw new Error('Workers Builds neposkytlo přístup pro Pages. Připoj nasazovací token s oprávněním Pages Edit a D1 Edit. Hodnotu tokenu nevkládej do zdrojového kódu ani chatu.');
    await deployPages({accountId,token});
  }else console.log('Local build only; Cloudflare Pages deployment runs in Workers Builds.');
}
