"""Exercise the real Worker + local D1 and two isolated browser/device profiles."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from playwright.sync_api import sync_playwright
import base64
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import uuid

ROOT=Path(__file__).resolve().parent.parent
checks=[]
def check(name,value):
    checks.append(bool(value))
    print(json.dumps({'name':name,'passed':bool(value)},ensure_ascii=False),flush=True)
    if not value: raise AssertionError(name)

with tempfile.TemporaryDirectory(prefix='tempo-cloud-test-') as temporary:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    executable=os.environ.get('TEMPO_WRANGLER') or str(ROOT/'node_modules/.bin/wrangler')
    if not Path(executable).is_file() and Path('/workspace/tools/cloudflare/node_modules/.bin/wrangler').is_file():executable='/workspace/tools/cloudflare/node_modules/.bin/wrangler'
    command=[executable] if Path(executable).is_file() else ['npx','--yes','wrangler@4.155.0']
    environment={**os.environ,'WRANGLER_SEND_METRICS':'false','XDG_CONFIG_HOME':str(Path(temporary)/'config')}
    with (Path(temporary)/'worker.log').open('w+') as log:
        process=subprocess.Popen([*command,'dev','--local','--ip','127.0.0.1','--port',str(port),'--persist-to',str(Path(temporary)/'db')],cwd=ROOT,env=environment,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            for attempt in range(120):
                try:
                    with urlopen(base+'/api/session',timeout=1) as response:
                        assert json.load(response)=={'user':None}
                    break
                except (URLError,HTTPError,AssertionError):
                    if process.poll() is not None or attempt==119:
                        log.seek(0);raise AssertionError('Local Worker failed to start: '+log.read()[-4000:])
                    time.sleep(.25)
            check('real Worker initializes the dedicated D1 schema',True)
            with sync_playwright() as p:
                chromium=os.environ.get('TEMPO_CHROMIUM') or shutil.which('chromium')
                browser=p.chromium.launch(**({'executable_path':chromium} if chromium else {}),args=['--no-sandbox'])
                contexts=[browser.new_context(locale='cs-CZ',timezone_id='Europe/Prague',viewport={'width':1280,'height':1000}) for _ in range(3)]
                pages=[context.new_page() for context in contexts]
                errors=[]
                for page in pages:page.on('pageerror',lambda error:errors.append(str(error)));page.goto(base)
                phone,windows,stranger=pages
                login=f'test-{uuid.uuid4().hex}@example.test'
                password='Test-only-correct-horse-42'

                def run(page,expression,arg=None):return page.evaluate(expression,arg)
                def storage(page,expression,arg=None):return run(page,'async arg => {const s=await import("./storage.mjs");'+expression+'}',arg)
                def state(page):return storage(page,'return s.loadState()')
                def sync(page):return storage(page,'await s.syncCloud();return s.getAccount().status')
                def api(page,path,method='GET',data=None,owner=True,origin=True):
                    return run(page,"""async arg => {
                      const s=await import('./storage.mjs');const account=s.getAccount();
                      const headers={...(arg.method!=='GET'?{'Content-Type':'application/json'}:{}),...(arg.owner&&account.user?{'X-Tempo-Account':account.user.id}:{})};
                      const response=await fetch(arg.path,{method:arg.method,headers,...(arg.data!==null?{body:JSON.stringify(arg.data)}:{})});
                      return {status:response.status,body:await response.json()};
                    }""",{'path':path,'method':method,'data':data,'owner':owner})

                phone.goto(base+'/#settings');phone.locator('[data-action="open-account"]').click()
                phone.locator('[data-auth-mode="register"]').click()
                phone.locator('#account-form [name="login"]').fill(login)
                phone.locator('#account-form [name="password"]').fill(password)
                phone.locator('#account-submit').click();phone.locator('#recovery-result').wait_for(state='visible')
                recovery=phone.locator('#recovery-code').input_value()
                check('registration exposes a recovery key and logs in with an HttpOnly cookie',len(recovery)==64 and all(c['httpOnly'] and c['sameSite']=='Strict' for c in contexts[0].cookies()))
                phone.locator('#recovery-result [data-action="close-account"]').click()
                storage(windows,'await s.authenticate("login",arg)',{'login':login,'password':password})
                check('second independent device signs in to the same account',storage(phone,'return s.getAccount().user.id')==storage(windows,'return s.getAccount().user.id'))

                phone.goto(base+'/#overview')
                if phone.locator('[data-action="start-own"]').count():phone.locator('[data-action="start-own"]').click()
                phone.locator('[data-action="add"]').first.click();phone.locator('#entry-type').select_option('hiking')
                phone.locator('[name="duration"]').fill('120');phone.locator('[name="distance"]').fill('8.5');phone.locator('[name="elevation"]').fill('420');phone.locator('[name="title"]').fill('Výšlap na Praděd')
                phone.locator('#place-query').fill('Praděd');phone.locator('.place-fields details').evaluate('(el)=>el.open=true')
                phone.locator('#place-latitude').fill('50.083');phone.locator('#place-longitude').fill('17.231')
                # Use a browser-produced valid image so photo processing and byte preservation are real.
                photo=run(phone,"""async()=>{const c=document.createElement('canvas');c.width=8;c.height=8;c.getContext('2d').fillRect(0,0,8,8);return c.toDataURL().split(',')[1]}""")
                phone.locator('#entry-photo').set_input_files({'name':'test.png','mimeType':'image/png','buffer':base64.b64decode(photo)})
                phone.locator('#save-entry').click();phone.locator('#entry-dialog').wait_for(state='hidden')
                check('hike with place distance ascent and photo synchronizes',sync(phone)=='Uloženo v účtu')
                sync(windows);saved=state(windows);first=saved['entries'][0]
                phone_photo=storage(phone,'return Array.from(new Uint8Array(await (await s.getPhoto(arg)).arrayBuffer()))',first['photoId'])
                windows_photo=storage(windows,'return Array.from(new Uint8Array(await (await s.getPhoto(arg)).arrayBuffer()))',first['photoId'])
                if phone_photo!=windows_photo:print(json.dumps({'photo_lengths':[len(phone_photo),len(windows_photo)],'prefixes':[phone_photo[:12],windows_photo[:12]]}),flush=True)
                check('second device receives the entire hike and exact stored photograph',len(saved['entries'])==1 and first['distance']==8.5 and first['elevation']==420 and first['location']['name']=='Praděd' and phone_photo==windows_photo)

                # Independent offline queues must merge; a deleted entry must not resurrect.
                sync(phone);sync(windows);contexts[0].set_offline(True);contexts[1].set_offline(True)
                storage(phone,'await s.updateState(d=>({...d,entries:[...d.entries,{...d.entries[0],id:"phone-walk",type:"walking",photoId:undefined,title:"Okruh u řeky"}]}))')
                storage(windows,'await s.updateState(d=>({...d,entries:[...d.entries,{...d.entries[0],id:"windows-walk",type:"walking",photoId:undefined,title:"Procházka v parku"}]}))')
                check('offline writes are committed to the per-account cache',len(state(phone)['entries'])==2 and len(state(windows)['entries'])==2)
                contexts[0].set_offline(False);contexts[1].set_offline(False)
                sync(phone);sync(windows);sync(phone)
                check('concurrent device writes merge without losing entries',len(state(phone)['entries'])==3 and len(state(windows)['entries'])==3)
                storage(phone,'await s.updateState(d=>({...d,entries:d.entries.filter(e=>e.id!==arg)}))',first['id']);sync(phone);sync(windows)
                check('deletions propagate to the other device',len(state(windows)['entries'])==2 and all(e['id']!=first['id'] for e in state(windows)['entries']))

                # Geocoding is mocked: do not send test locations to an external service.
                phone.route('https://photon.komoot.io/**',lambda route:route.fulfill(json={'features':[{'geometry':{'type':'Point','coordinates':[14.41,50.1]},'properties':{'name':'Stromovka','city':'Praha'}}]}))
                phone.route('https://tile.openstreetmap.org/**',lambda route:route.fulfill(content_type='image/png',body=base64.b64decode(photo)))
                phone.goto(base+'/#diary');phone.locator('[data-action="edit"]').first.click()
                phone.locator('#place-query').fill('Stromovka');phone.locator('[data-action="search-place"]').click();phone.locator('[data-place-result="0"]').click()
                phone.locator('#save-entry').click();phone.locator('#entry-dialog').wait_for(state='hidden');sync(phone)
                phone.goto(base+'/#stats');phone.locator('[data-action="show-map"]').click()
                check('a walk can add a searched place and the secondary map renders safe clickable points',phone.locator('.leaflet-interactive').count()==2 and phone.locator('#places-map').is_visible())
                phone.locator('.leaflet-interactive').first.click()
                check('map popup shows the saved place',phone.locator('.leaflet-popup-content').inner_text().find('Stromovka')>=0)
                phone.set_viewport_size({'width':390,'height':844})
                check('map and cloud status fit a mobile viewport',run(phone,'()=>document.documentElement.scrollWidth<=innerWidth'))
                phone.screenshot(path=str(Path(os.environ.get('TEMPO_CLOUD_SCREENSHOT',str(Path(temporary)/'places.png')))),full_page=True)

                check('anonymous requests cannot read diaries',api(stranger,'/api/diary')['status']==401)
                stranger_user=storage(stranger,'return s.authenticate("register",arg)',{'login':f'other-{uuid.uuid4().hex}@example.test','password':password})
                check('a different account sees an empty diary',api(stranger,'/api/diary')['body']['state']['entries']==[])
                check('a different account cannot fetch someone else’s photograph',api(stranger,'/api/photos/'+first['photoId'])['status']==404)
                check('account mismatch headers cannot access another account',api(phone,'/api/diary',owner=False)['status']==409)
                remote=api(phone,'/api/diary')['body']
                check('stale revision cannot overwrite newer data',api(phone,'/api/diary','PUT',{'revision':remote['revision']-1,'state':remote['state']})['status']==409)
                invalid={**remote['state'],'entries':[{**remote['state']['entries'][0],'location':{'name':'Bad','latitude':99,'longitude':0}}]}
                check('server independently rejects invalid coordinates',api(phone,'/api/diary','PUT',{'revision':remote['revision'],'state':invalid})['status']==400)
                try:
                    urlopen(Request(base+'/api/logout',data=b'{}',headers={'Content-Type':'application/json','Origin':'https://unrelated.example'},method='POST'))
                    csrf=200
                except HTTPError as error:csrf=error.code
                check('cross-origin state changes are rejected',csrf==403)
                recovery_result=storage(phone,'return s.authenticate("recover",arg)',{'login':login,'password':password+'new','recoveryCode':recovery})
                check('recovery rotates the key and revokes other device sessions',len(recovery_result['recoveryCode'])==64 and api(windows,'/api/diary')['status']==401)
                check('previous recovery key cannot be reused',api(phone,'/api/recover','POST',{'login':login,'password':password,'recoveryCode':recovery})['status']==401)
                storage(phone,'await s.logout()')
                check('logout restores the independent local diary without another account’s data',storage(phone,'return s.getAccount().user') is None and state(phone) is None)
                check('no browser JavaScript errors in cloud and maps flows',not errors)
                browser.close()
        finally:
            import signal
            os.killpg(process.pid,signal.SIGTERM)
            process.wait(timeout=15)
print(json.dumps({'passed':sum(checks),'failed':len(checks)-sum(checks)}))
