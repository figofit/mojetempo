"""Real Pages+D1 invitation flow with isolated accounts, database and a fixture link."""
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError, HTTPError
from playwright.sync_api import sync_playwright
import hashlib,json,os,shutil,signal,socket,subprocess,tempfile,time,uuid

ROOT=Path(__file__).resolve().parent.parent
checks=[]
def check(name,value):
    checks.append(bool(value));print(json.dumps({'name':name,'passed':bool(value)},ensure_ascii=False),flush=True)
    if not value:raise AssertionError(name)

with tempfile.TemporaryDirectory(prefix='tempo-invitation-smoke-') as temporary:
    temp=Path(temporary);public=temp/'public'
    code='A'*43
    fixture=[{'id':'11111111-1111-4111-8111-111111111111','tokenHash':hashlib.sha256(code.encode()).hexdigest(),'expiresAt':'2099-01-01T00:00:00Z'}]
    subprocess.run(['python3','scripts/build_site.py','--output-dir',str(public)],cwd=ROOT,check=True,capture_output=True)
    environment={**os.environ,'WRANGLER_SEND_METRICS':'false','XDG_CONFIG_HOME':str(temp/'config'),'TEMPO_TEST_INVITATION_CONFIG':json.dumps(fixture),'TEMPO_TEST_PUBLIC':str(public)}
    subprocess.run(['node','--input-type=module','-e','''
      import {build} from 'esbuild';
      import {writeFile} from 'node:fs/promises';
      import {createCipheriv,createHash,randomBytes} from 'node:crypto';
      const records=JSON.parse(process.env.TEMPO_TEST_INVITATION_CONFIG),iv=randomBytes(12),key=createHash('sha256').update('moje-tempo-invitation:'+'A'.repeat(43)).digest(),cipher=createCipheriv('aes-256-gcm',key,iv);
      const encrypted=Buffer.concat([cipher.update(JSON.stringify({name:'Testovací profil',milestone:{date:'2026-10-08',title:'Zkušební milník',note:'Osobní milník.'}}),'utf8'),cipher.final(),cipher.getAuthTag()]);
      records[0].payload={iv:iv.toString('base64'),data:encrypted.toString('base64')};
      const output=process.env.TEMPO_TEST_PUBLIC;
      await build({entryPoints:['worker/index.mjs'],outfile:output+'/_worker.js',bundle:true,format:'esm',platform:'browser',target:'es2022',loader:{'.sql':'text'},logLevel:'silent',plugins:[{name:'isolated-invitation-fixture',setup(b){b.onLoad({filter:/invitations\\.config\\.json$/},()=>({contents:JSON.stringify(records),loader:'json'}));}}]});
      await writeFile(output+'/_routes.json',JSON.stringify({version:1,include:['/api/*'],exclude:[]}));
    '''],cwd=ROOT,env=environment,check=True,capture_output=True)
    (temp/'wrangler.toml').write_text('name="tempo-invitation-test"\npages_build_output_dir="./public"\ncompatibility_date="2026-10-29"\n[[d1_databases]]\nbinding="DB"\ndatabase_name="tempo-invitation-test"\ndatabase_id="11111111-1111-4111-8111-111111111111"\n')
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}/';link=base+'#pozvanka='+code
    with (temp/'runtime.log').open('w+') as log:
        process=subprocess.Popen([str(ROOT/'node_modules/.bin/wrangler'),'pages','dev',str(public),'--ip','127.0.0.1','--port',str(port),'--persist-to',str(temp/'db')],cwd=temp,env=environment,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            for attempt in range(120):
                try:
                    with urlopen(base+'api/session',timeout=1) as response:assert json.load(response)=={'user':None}
                    break
                except (URLError,HTTPError,AssertionError):
                    if process.poll() is not None or attempt==119:
                        log.seek(0);raise AssertionError('Local invitation runtime failed: '+log.read()[-3000:])
                    time.sleep(.25)
            with sync_playwright() as p:
                executable=os.environ.get('TEMPO_CHROMIUM') or shutil.which('chromium')
                browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
                contexts=[browser.new_context(locale='cs-CZ',timezone_id='Europe/Prague',viewport={'width':390,'height':844}) for _ in range(3)]
                phone,pc,stranger=[context.new_page() for context in contexts]
                errors=[];urls=[]
                for page in [phone,pc,stranger]:page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:urls.append(r.url))
                login=f'invited-{uuid.uuid4().hex}@example.test';password='Only-for-local-test-42'
                phone.goto(link)
                phone.locator('[data-action="invite-register"]').wait_for(state='visible')
                check('private invitation shows the requested personal milestone', 'Testovací profil' in phone.locator('.invitation-panel h1').inner_text() and 'Zkušební milník' in phone.locator('.invitation-milestone').inner_text() and '8. 10. 2026' in phone.locator('.invitation-milestone').inner_text())
                check('invitation token stays out of navigation and resource URLs',not any(code in url for url in urls))
                phone.locator('[data-action="invite-register"]').click()
                phone.locator('#account-form [name="login"]').fill(login)
                phone.locator('#account-form [name="password"]').fill(password)
                phone.locator('#account-submit').click()
                phone.locator('#recovery-result').wait_for(state='visible')
                phone.locator('#recovery-result [data-action="close-account"]').click()
                phone.locator('[data-action="accept-invitation"]').click()
                phone.locator('.timeline-card').wait_for(state='visible')
                diary=phone.evaluate('async()=> (await import("./storage.mjs")).loadState()')
                check('new personal account receives exactly one correctly dated chronicle moment',len(diary['entries'])==1 and diary['entries'][0]['date']=='2026-10-08' and diary['entries'][0]['type']=='moment' and diary['entries'][0]['duration']==0 and diary['settings']['name']=='Testovací profil')
                check('acceptance clears the private token and fits phone width',phone.url.endswith('#chronicle') and phone.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                pc.goto(base)
                pc.evaluate('async arg=>{const s=await import("./storage.mjs");await s.authenticate("login",arg);await s.syncCloud();}',{'login':login,'password':password})
                remote=pc.evaluate('async()=> (await import("./storage.mjs")).loadState()')
                check('the same account sees the personal milestone on a second device',remote==diary)
                phone.goto(link)
                phone.locator('.invitation-panel').get_by_text('Milník už byl vložený do tohoto účtu.').wait_for()
                check('reopening the invitation does not duplicate the moment',len(phone.evaluate('async()=> (await import("./storage.mjs")).loadState()')['entries'])==1)
                stranger.goto(base)
                stranger.evaluate('async arg=>{const s=await import("./storage.mjs");await s.authenticate("register",arg);}',{'login':f'stranger-{uuid.uuid4().hex}@example.test','password':password})
                stranger.goto(link)
                stranger.locator('.invitation-panel').get_by_text('Tato pozvánka už byla použitá.',exact=False).wait_for()
                check('another account cannot claim the invitation or see the invited account identity',stranger.locator('[data-action="accept-invitation"]').count()==0 and login not in stranger.locator('.invitation-panel').inner_text() and len(stranger.evaluate('async()=> (await import("./storage.mjs")).loadState()')['entries'])==0)
                check('invitation flow raises no browser JavaScript errors',not errors)
                browser.close()
        finally:
            try:os.killpg(process.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
print(json.dumps({'summary':{'passed':sum(checks),'total':len(checks)}}),flush=True)
