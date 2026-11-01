import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const repoRoot=fileURLToPath(new URL('../',import.meta.url));
export async function buildOlda({root=path.join(repoRoot,'clients/olda'),output=path.join(repoRoot,'olda-dist')}={}) {
  const source=repoRoot,out=path.resolve(output);
  if(out===repoRoot||repoRoot.startsWith(out+path.sep))throw new Error('Neplatný výstup sestavení.');
  fs.mkdirSync(out,{recursive:true});
  for(const file of ['icon-192.png','icon-512.png'])fs.copyFileSync(path.join(root,'assets',file),path.join(out,file));
  for(const file of ['manifest.webmanifest','_headers'])fs.copyFileSync(path.join(root,'src',file),path.join(out,file));
  const read=name=>fs.readFileSync(path.join(root,'src',name),'utf8');
  const files=['domain.mjs','personal.mjs','storage.mjs','local-storage.mjs','sync-rules.mjs','places.mjs','planning.mjs','habits.mjs','invitation.mjs','appearance.mjs','mobility-catalog.mjs','schedule-rules.mjs','pwa.mjs','vendor/leaflet/leaflet.js','vendor/leaflet/leaflet.css','vendor/leaflet/LICENSE'];
  for(const file of files){const to=path.join(out,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(source,file),to);}
  fs.copyFileSync(path.join(source,'app.js'),path.join(out,'tempo-app.js'));
  fs.copyFileSync(path.join(root,'src/shared.mjs'),path.join(out,'olda-shared.mjs'));
  const seed=JSON.parse(read('data.json'));
  for(const key of ['sessions','days','habits','milestones'])seed[key]=[];
  seed.plan={title:'Tvůj plán vznikne s námi',focus:'',notes:'',exercises:[]};
  const safe=value=>JSON.stringify(value).replaceAll('<','\\u003c');
  const dialogs=fs.readFileSync(path.join(source,'index.html'),'utf8').split('    <dialog id="entry-dialog"')[1].split('    <div id="toast"')[0];
  let html=read('index.html');
  const css=fs.readFileSync(path.join(source,'styles.css'),'utf8')+'\n'+read('styles.css')+'\n'+read('cloud.css')+'\n'+read('shared.css');
  const values={'/*__CSS__*/':css,'/*__DATA__*/':safe(seed),'/*__ASSETS__*/':'{}','/*__CONFIG__*/':'{"mode":"shared"}','/*__CORE__*/':read('core.js'),'/*__CLOUD__*/':read('cloud.js'),'/*__APP__*/':read('app.js')};
  for(const [key,value] of Object.entries(values))html=html.replace(key,()=>value);
  html=html.replace('</head>','<meta name="tempo-diary" content="olda"><meta name="tempo-build" content="__TEMPO_VERSION__"><link rel="stylesheet" href="./vendor/leaflet/leaflet.css"></head>');
  html=html.replace('</body>','<dialog id="entry-dialog"'+dialogs+'<script type="module" src="./olda-shared.mjs"></script></body>');
  const hash=createHash('sha256').update(html);
  for(const file of [...files,'tempo-app.js','olda-shared.mjs'])hash.update(fs.readFileSync(path.join(out,file)));
  const version=hash.digest('hex');html=html.replaceAll('__TEMPO_VERSION__',version);
  fs.writeFileSync(path.join(out,'index.html'),html);
  const shell=['index.html','manifest.webmanifest','icon-192.png','icon-512.png',...files,'tempo-app.js','olda-shared.mjs'];
  const integrity=Object.fromEntries(shell.map(file=>[file,'sha256-'+createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('base64')]));
  let sw=fs.readFileSync(path.join(source,'service-worker.js'),'utf8').replaceAll('__TEMPO_VERSION__',version).replace('/* __TEMPO_INTEGRITY__ */',JSON.stringify(integrity).slice(1,-1)).replace(/const SHELL_PATHS = \[[\s\S]*?\];/,`const SHELL_PATHS = ${JSON.stringify(shell)};`).replace("const CACHE_NAME = 'moje-tempo-shell-","const CACHE_NAME = 'olda-original-shared-");
  fs.writeFileSync(path.join(out,'service-worker.js'),sw);fs.writeFileSync(path.join(out,'sw.js'),sw);
  await build({entryPoints:[path.join(root,'server/shared-worker.mjs')],outfile:path.join(out,'_worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',loader:{'.sql':'text'},logLevel:'silent'});
  fs.writeFileSync(path.join(out,'_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:[]}));
  console.log('Původní Oldova aplikace: společné účty, formuláře, D1 a offline synchronizace.');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {const result=await buildOlda();console.log('Olda artifact: '+path.join(repoRoot,'olda-dist'));}
