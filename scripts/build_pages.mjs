/** Pure packaging: a Pages advanced-mode Worker and the allowlisted public shell. */
import {cp,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const ROOT=fileURLToPath(new URL('../',import.meta.url));
export function buildPublic() {
  const result=spawnSync('python3',['scripts/build_site.py'],{cwd:ROOT,stdio:'inherit'});
  if(result.status!==0)throw new Error('Sestavení veřejné aplikace selhalo.');
}
export async function preparePages() {
  // Load deployment dependencies inside the reported build step, so missing
  // packages produce our readable diagnostic rather than an uncaught import.
  const {build}=await import('esbuild');
  const directory=await mkdtemp(join(tmpdir(),'moje-tempo-pages-'));
  const publicDir=join(directory,'public');
  await cp(join(ROOT,'dist'),publicDir,{recursive:true});
  await build({entryPoints:[join(ROOT,'worker/index.mjs')],outfile:join(publicDir,'_worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',loader:{'.sql':'text'},logLevel:'silent'});
  await writeFile(join(publicDir,'_routes.json'),JSON.stringify({version:1,include:['/api/*'],exclude:[]}));
  return {directory,publicDir};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  buildPublic();
  const result=await preparePages();
  console.log(`Cloudflare Pages artifact: ${result.publicDir}`);
}
