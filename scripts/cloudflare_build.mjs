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

function hideSecrets(value,environment=process.env) {
  let message=String(value||'');
  for(const secret of [environment.CLOUDFLARE_API_TOKEN,environment.CF_API_TOKEN])if(secret)message=message.replaceAll(secret,'[skryto]');
  return message;
}
function redact(value,environment=process.env) {
  return hideSecrets(value||'Neznámá chyba',environment).replace(/[\r\n\t]+/g,' ').slice(0,1000);
}
export function deploymentError(error,environment=process.env) {
  const cause=typeof error?.cause?.code==='string'?` (${error.cause.code.replace(/[^A-Z0-9_]/g,'')})`:'';
  return `MOJE_TEMPO_DEPLOY_ERROR | ${redact(error?.stage||'nasazení',environment)} | ${redact(error?.message,environment)}${cause}`;
}

export function accountFromWrangler(environment=process.env,execute=spawnSync) {
  const cli=join(ROOT,'node_modules/wrangler/bin/wrangler.js');
  const result=execute(process.execPath,[cli,'whoami','--json'],{cwd:ROOT,encoding:'utf8',env:{...environment,WRANGLER_SEND_METRICS:'false'}});
  let info;
  try{if(result.status===0)info=JSON.parse(result.stdout);}catch{/* Report configuration only; never print raw account metadata. */}
  const accounts=info?.loggedIn&&Array.isArray(info.accounts)?info.accounts:[];
  if(accounts.length===1&&typeof accounts[0].id==='string'&&/^[a-f0-9]{32}$/i.test(accounts[0].id))return accounts[0].id;
  throw new Error(accounts.length>1?'Wrangler má přístup k více účtům. V nastavení buildu nastav CLOUDFLARE_ACCOUNT_ID pro účet s aplikací mojetempo.':'Wrangler nedokázal určit účet. V nastavení buildu nastav CLOUDFLARE_ACCOUNT_ID pro účet s aplikací mojetempo.');
}

export function wranglerFailure(result,environment=process.env) {
  const output=`${result.stderr||''}\n${result.stdout||''}`.replace(/\u001b\[[0-9;]*m/g,'');
  const lines=output.split('\n');
  const start=lines.findIndex(line=>/\[ERROR\]|^\s*Error(?: \[[^\]]+\])?:/.test(line));
  const detail=start<0?(result.error?.code||result.signal||'Wrangler nevrátil podrobnost chyby.'):lines.slice(start,start+4).filter(line=>line.trim()).join(' ');
  return new Error(`Odeslání do Pages selhalo (exit ${result.status??'unknown'}): ${redact(detail,environment)}`);
}

export function cloudflareAPI(accountId,token,fetcher=fetch) {
  return async function call(path,method='GET',data) {
    const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(30000)});
    let value;try{value=await response.json();}catch{throw new Error(`Cloudflare API ${method} ${path.split('?')[0]}: HTTP ${response.status}.`);}
    if(!response.ok||value.success===false) {
      const code=value.errors?.[0]?.code;
      const detail=value.errors?.[0]?.message;
      const scope=path.startsWith('/pages/')?'Cloudflare Pages Edit':path.startsWith('/d1/')?'D1 Edit':'přístup k účtu';
      const permission=[401,403].includes(response.status)?` Ověř oprávnění ${scope} nasazovacího tokenu pro tento účet.`:'';
      const error=new Error(`Cloudflare API ${method} ${path.split('?')[0]}: HTTP ${response.status}, kód ${code||'unknown'}.${detail?' '+redact(detail,{CLOUDFLARE_API_TOKEN:token}):''}${permission}`);
      error.status=response.status;error.code=code;throw error;
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
  try{project=await api(`/pages/projects/${PROJECT}`);}catch(error){if(error.status!==404&&error.code!==8000007)throw error;}
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
  console.log('[Moje tempo] Krok: samostatná databáze D1 a projekt Pages');
  const {database}=await ensureProject(api);
  console.log('[Moje tempo] Krok: sestavení serverové části pro Pages');
  const stage=await preparePages();
  try {
    await writeFile(join(stage.directory,'wrangler.toml'),`name = "${PROJECT}"\npages_build_output_dir = "./public"\ncompatibility_date = "2026-10-29"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${DATABASE}"\ndatabase_id = "${database.uuid}"\n`);
    const cli=join(ROOT,'node_modules/wrangler/bin/wrangler.js');
    console.log('[Moje tempo] Krok: odeslání aplikace do Pages');
    // Pages discovers wrangler.toml from cwd and rejects the global --config flag.
    const environment={...process.env,CLOUDFLARE_ACCOUNT_ID:accountId,CLOUDFLARE_API_TOKEN:token,WRANGLER_SEND_METRICS:'false'};
    const result=spawnSync(process.execPath,[cli,'pages','deploy',stage.publicDir,'--project-name',PROJECT,'--branch','main','--force'],{cwd:stage.directory,encoding:'utf8',maxBuffer:8*1024*1024,env:environment});
    // Keep the original CLI error in the final diagnostic, not just "custom build failed".
    if(result.stdout)process.stdout.write(hideSecrets(result.stdout,environment));
    if(result.stderr)process.stderr.write(hideSecrets(result.stderr,environment));
    if(result.status!==0)throw wranglerFailure(result,environment);
    console.log('[Moje tempo] Krok: připojení moje.itfit.cz k projektu Pages');
    await attachDomain(api);
    console.log(`Moje tempo Pages deployed: https://${PROJECT}.pages.dev/`);
    console.log(`DNS CNAME: moje -> ${PROJECT}.pages.dev ; vlastní doména ${DOMAIN}`);
  }finally{await rm(stage.directory,{recursive:true,force:true});}
}

export async function runBuild({environment=process.env,build=buildPublic,deploy=deployPages,resolveAccount=accountFromWrangler,report=console.log}={}) {
  let stage='sestavení veřejné aplikace';
  try {
    build();
    // WORKERS_CI=1 is the documented service flag, not a user-specific credential.
    if(environment.WORKERS_CI!=='1'){report('Local build only; Cloudflare Pages deployment runs in Workers Builds.');return;}
    stage='přístup k účtu Cloudflare';
    const token=environment.CLOUDFLARE_API_TOKEN||environment.CF_API_TOKEN;
    if(!token)throw new Error('Workers Builds nepředalo CLOUDFLARE_API_TOKEN. V nastavení buildu připoj nasazovací token s oprávněním Pages Edit a D1 Edit. Hodnotu tokenu neposílej do chatu.');
    const accountId=environment.CLOUDFLARE_ACCOUNT_ID||environment.CF_ACCOUNT_ID||await resolveAccount(environment);
    stage='nasazení Pages a D1';
    await deploy({accountId,token});
  }catch(error){error.stage=stage;throw error;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{await runBuild();}
  catch(error){console.error(deploymentError(error));process.exitCode=1;}
}
