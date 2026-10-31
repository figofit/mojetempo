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
    runtime=os.environ.get('TEMPO_RUNTIME','worker')
    stage=None
    working_directory=ROOT
    arguments=['dev','--env','local','--local','--ip','127.0.0.1','--port',str(port),'--persist-to',str(Path(temporary)/'db')]
    if runtime=='pages':
        packaged=subprocess.run(['node','--input-type=module','-e','import {preparePages} from "./scripts/build_pages.mjs"; console.log(JSON.stringify(await preparePages()));'],cwd=ROOT,capture_output=True,text=True,check=True)
        stage=json.loads(packaged.stdout)
        working_directory=Path(stage['directory'])
        (working_directory/'wrangler.toml').write_text('name = "tempo-test"\npages_build_output_dir = "./public"\ncompatibility_date = "2026-10-29"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "tempo-test"\ndatabase_id = "11111111-1111-4111-8111-111111111111"\n')
        arguments=['pages','dev',stage['publicDir'],'--ip','127.0.0.1','--port',str(port),'--persist-to',str(Path(temporary)/'db')]
    with (Path(temporary)/'worker.log').open('w+') as log:
        process=subprocess.Popen([*command,*arguments],cwd=working_directory,env=environment,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
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
            try:
                with urlopen(base+'/_worker.js',timeout=5) as response:
                    assert b'CREATE TABLE IF NOT EXISTS accounts' not in response.read()
            except HTTPError as error:
                # Reserved Pages paths may be rejected before normal asset routing.
                assert b'CREATE TABLE IF NOT EXISTS accounts' not in error.read()
            check('server bundle is never served as a public asset',True)
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
                phone.locator('#place-query').fill('Praděd');phone.locator('#place-coordinates').evaluate('(el)=>el.open=true')
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

                # Strength details, independent targets, editing and cloud validation.
                phone.goto(base+'/#diary')
                phone.locator('[data-action="add"]').first.click();phone.locator('#entry-type').select_option('strength')
                phone.locator('[name="duration"]').fill('50');phone.locator('[name="title"]').fill('Silový trénink se vzory');phone.locator('#workout-focus').select_option('fullbody')
                for pattern,sets in [('squat',3),('hinge',3),('horizontal_push',3),('horizontal_pull',6)]:
                    phone.locator('[data-action="add-exercise"]').click()
                    row=phone.locator('.exercise-row').last;row.locator('.exercise-pattern').select_option(pattern);row.locator('.exercise-sets').fill(str(sets))
                    if pattern=='hinge':row.locator('.exercise-name').fill('Rumunský mrtvý tah')
                phone.locator('#save-entry').click();phone.locator('#entry-dialog').wait_for(state='hidden');sync(phone);sync(windows)
                strength_entry=next(entry for entry in state(windows)['entries'] if entry['type']=='strength')
                check('exercise patterns named exercises split and working sets synchronize to another device',strength_entry['workout']['focus']=='fullbody' and len(strength_entry['workout']['exercises'])==4 and strength_entry['workout']['exercises'][1]['name']=='Rumunský mrtvý tah')
                phone.goto(base+'/#stats')
                check('strength ratios count working sets rather than minutes or exercises','6 : 3' in phone.locator('#strength-balance').inner_text() and 'Vyšší podíl: tahy' in phone.locator('#strength-balance').inner_text())
                phone.goto(base+'/#settings');phone.locator('[name="strengthPullPerPush"]').fill('2');phone.locator('#settings-form button[type="submit"]').click();sync(phone);sync(windows)
                check('custom strength targets synchronize independently of other goals',state(windows)['settings']['strengthPullPerPush']==2)
                phone.goto(base+'/#stats');phone.locator('[data-strength-period="28days"]').click()
                check('strength pane applies the chosen target and supports a full split over 28 days','V rozmezí zvoleného cíle' in phone.locator('.strength-ratio').first.inner_text() and phone.locator('[data-strength-period="28days"]').get_attribute('class').find('active')>=0)
                phone.goto(base+'/#diary');phone.locator('[data-action="edit"][data-id="'+strength_entry['id']+'"]').click()
                check('editing restores every exercise and the workout focus',phone.locator('.exercise-row').count()==4 and phone.locator('#workout-focus').input_value()=='fullbody')
                phone.locator('#workout-focus').select_option('custom');phone.locator('#workout-split').fill('Záda + biceps');phone.locator('.exercise-row').last.locator('[data-action="remove-exercise"]').click()
                phone.locator('#save-entry').click();phone.locator('#entry-dialog').wait_for(state='hidden');sync(phone);sync(windows)
                modified=next(entry for entry in state(windows)['entries'] if entry['id']==strength_entry['id'])
                check('custom split names and removing an exercise survive sync',modified['workout']['splitName']=='Záda + biceps' and len(modified['workout']['exercises'])==3)

                # Library and recurring plans belong to the same private account.
                # Use the real adapter/D1 while keeping test choices local to these profiles.
                planning=run(phone,"""()=>{
                  const today=new Date(),date=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
                  return {date,weekday:(today.getDay()+6)%7};
                }""")
                plan={'id':'plan-phone-workout','weekday':planning['weekday'],'label':'Můj vlastní trénink','type':'strength'}
                custom_phone={'id':'custom-phone-squat','name':'Dřep s mojí kettlebell','pattern':'squat'}
                custom_windows={'id':'custom-windows-row','name':'Přítah na mém stroji','pattern':'horizontal_pull'}
                storage(phone,'await s.updateState(d=>({...d,settings:{...d.settings,weeklyPlan:[arg.plan],customExercises:[arg.exercise],favoriteExercises:["goblet-squat",arg.exercise.id]}}))',{'plan':plan,'exercise':custom_phone})
                sync(phone);sync(windows)
                received=state(windows)['settings']
                check('personal exercise library favorites and recurring plan synchronize from phone to Windows',received['weeklyPlan']==[plan] and received['customExercises']==[custom_phone] and set(received['favoriteExercises'])=={'goblet-squat',custom_phone['id']} and received['strengthPullPerPush']==2)

                sync(phone);sync(windows);contexts[0].set_offline(True);contexts[1].set_offline(True)
                storage(phone,'const p=await import("./planning.mjs");await s.updateState(d=>({...d,settings:{...d.settings,...p.togglePlanCheck(d.settings,arg.planId,arg.date),favoriteExercises:[...d.settings.favoriteExercises,"dead-bug"]}}))',{'planId':plan['id'],'date':planning['date']})
                storage(windows,'await s.updateState(d=>({...d,settings:{...d.settings,customExercises:[...d.settings.customExercises,arg],favoriteExercises:[...d.settings.favoriteExercises,"bench-press",arg.id]}}))',custom_windows)
                check('phone can mark its plan complete offline while Windows changes its exercise library',len(state(phone)['settings']['planChecks'])==1 and len(state(windows)['settings']['customExercises'])==2)
                contexts[0].set_offline(False);contexts[1].set_offline(False)
                sync(phone);sync(windows);sync(phone)
                expected_favorites={'goblet-squat',custom_phone['id'],'dead-bug','bench-press',custom_windows['id']}
                paired=[state(page)['settings'] for page in [phone,windows]]
                check('independent offline favorites custom exercises and plan completion merge on both devices',all(set(item['favoriteExercises'])==expected_favorites and item['customExercises']==[custom_phone,custom_windows] and item['weeklyPlan']==[plan] and item['planChecks']==[{'id':planning['date']+':'+plan['id'],'date':planning['date'],'planId':plan['id']}] for item in paired))
                # A fresh page load proves server state is retained beyond the open UI.
                windows.reload()
                windows.locator('#account-profile').filter(has_text=login).wait_for()
                sync(windows)
                check('Windows reload keeps the same private plan library and completed day',state(windows)['settings']['planChecks']==paired[0]['planChecks'] and set(state(windows)['settings']['favoriteExercises'])==expected_favorites)
                # Habits synchronize independently, including two simultaneous offline checks.
                storage(phone,'await s.updateState(d=>({...d,settings:{...d.settings,habits:["vitamins","protein"]}}))')
                sync(phone);sync(windows)
                entries_before_habits=len(state(phone)['entries'])
                contexts[0].set_offline(True);contexts[1].set_offline(True)
                for page,habit in [(phone,'vitamins'),(windows,'protein')]:
                    storage(page,'const h=await import("./habits.mjs");await s.updateState(d=>({...d,settings:{...d.settings,...h.toggleHabit(d.settings,arg)}}))',habit)
                contexts[0].set_offline(False);contexts[1].set_offline(False)
                sync(phone);sync(windows);sync(phone)
                check('independent offline vitamin and protein checks merge between devices without exercise entries',all({check['habitId'] for check in state(page)['settings']['habitChecks']}=={'vitamins','protein'} and len(state(page)['entries'])==entries_before_habits for page in [phone,windows]))
                phone.goto(base+'/#settings')
                with phone.expect_download() as download:
                    phone.locator('[data-action="backup"]').click()
                backup_path=Path(temporary)/'strength-backup.json';download.value.save_as(str(backup_path));backup=json.loads(backup_path.read_text())
                check('complete backup preserves workout details targets personal library and weekly plan',next(entry for entry in backup['entries'] if entry['id']==strength_entry['id'])['workout']==modified['workout'] and backup['settings']['strengthPullPerPush']==2 and set(backup['settings']['favoriteExercises'])==expected_favorites and backup['settings']['weeklyPlan']==[plan] and len(backup['settings']['planChecks'])==1)
                check('private backup preserves the optional habits and their daily history',backup['settings']['habits']==['vitamins','protein'] and len(backup['settings']['habitChecks'])==2)
                if not (run(phone,'()=>document.documentElement.scrollWidth<=innerWidth')):raise AssertionError('Strength controls overflow on mobile')

                check('anonymous requests cannot read diaries',api(stranger,'/api/diary')['status']==401)
                stranger_user=storage(stranger,'return s.authenticate("register",arg)',{'login':f'other-{uuid.uuid4().hex}@example.test','password':password})
                # New schedule fields and exercise metadata use the same private D1 snapshots.
                rest={'id':'pause-device-test','start':planning['date'],'end':planning['date'],'label':'Volněji'}
                mobility={'id':'mobility-device-test','createdAt':'2026-10-29T12:00:00Z','date':planning['date'],'type':'mobility','duration':15,'title':'Mobilita','mobilityExercises':['dead-bug','custom:Moje kyčle']}
                storage(phone,'await s.updateState(d=>({...d,settings:{...d.settings,trainingSince:"2016-10-23",restPeriods:[arg.rest]},entries:[...d.entries,arg.mobility]}))',{'rest':rest,'mobility':mobility})
                sync(phone);sync(windows)
                other=state(windows)
                check('rest periods training age and selected mobility exercises synchronize across devices',other['settings']['restPeriods']==[rest] and other['settings']['trainingSince']=='2016-10-23' and next(e for e in other['entries'] if e['id']==mobility['id'])['mobilityExercises']==mobility['mobilityExercises'])
                # A second hostname has separate cookies and IndexedDB while using
                # the same application API and dedicated D1. No production domains
                # or real profiles are involved in this integration check.
                other_base=base.replace('127.0.0.1','localhost')
                personal_context=browser.new_context(locale='cs-CZ',timezone_id='Europe/Prague',viewport={'width':1280,'height':1000})
                personal=personal_context.new_page()
                personal.on('pageerror',lambda error:errors.append(str(error)))
                personal.goto(other_base+'/#settings')
                personal.locator('[data-action="open-account"]').wait_for()
                check('a different hostname grants no access just by opening its address',api(personal,'/api/diary')['status']==401 and storage(personal,'return s.getAccount().user') is None)
                storage(personal,'await s.authenticate("login",arg)',{'login':login,'password':password})
                check('the same credentials on a second hostname identify the same account and diary',storage(personal,'return s.getAccount().user.id')==storage(phone,'return s.getAccount().user.id') and state(personal)==state(phone))
                custom_shared={'id':'custom-shared-row','name':'Vlastní přítah přes druhou adresu','pattern':'horizontal_pull'}
                shared_plan={'id':'plan-shared-work','weekday':planning['weekday'],'label':'Moje vlastní činnost','type':'work'}
                storage(personal,'const h=await import("./habits.mjs");await s.updateState(d=>{const settings={...d.settings,modules:["movement","chronicle"],habits:[...d.settings.habits,"mobility"],customExercises:[...d.settings.customExercises,arg.exercise],favoriteExercises:[...d.settings.favoriteExercises,arg.exercise.id],weeklyPlan:[...d.settings.weeklyPlan,arg.plan]};return {...d,settings:{...settings,...h.toggleHabit(settings,"mobility",arg.date)}}})',{'exercise':custom_shared,'plan':shared_plan,'date':planning['date']})
                sync(personal);sync(phone);sync(windows)
                shared=state(phone)
                check('custom exercises personal plan modules habits and checked days match across addresses',state(personal)==shared and state(windows)==shared and shared['settings']['modules']==['movement','chronicle'] and shared['settings']['customExercises'][-1]==custom_shared and shared['settings']['weeklyPlan'][-1]==shared_plan and any(c['habitId']=='mobility' for c in shared['settings']['habitChecks']))
                storage(personal,'await s.updateState(d=>({...d,entries:d.entries.map(e=>e.id===arg?{...e,title:"Změna z druhé adresy"}:e)}))',mobility['id'])
                sync(personal);sync(phone)
                check('editing an entry from the second address updates the original record without duplicates',len(state(phone)['entries'])==len(shared['entries']) and next(e for e in state(phone)['entries'] if e['id']==mobility['id'])['title']=='Změna z druhé adresy')
                storage(phone,'await s.updateState(d=>({...d,entries:d.entries.map(e=>e.id===arg?{...e,title:"Změna zpátky z první adresy"}:e)}))',mobility['id'])
                sync(phone);sync(personal)
                check('changes from the first address return to the second address in the same diary',next(e for e in state(personal)['entries'] if e['id']==mobility['id'])['title']=='Změna zpátky z první adresy')
                personal.reload()
                personal.locator('#account-profile').filter(has_text=login).wait_for()
                sync(personal)
                check('second hostname reload preserves the shared account settings and journal',state(personal)==state(phone))
                check('a different account sees an empty diary',api(stranger,'/api/diary')['body']['state']['entries']==[])
                check('a different account cannot fetch someone else’s photograph',api(stranger,'/api/photos/'+first['photoId'])['status']==404)
                check('account mismatch headers cannot access another account',api(phone,'/api/diary',owner=False)['status']==409)
                remote=api(phone,'/api/diary')['body']
                check('stale revision cannot overwrite newer data',api(phone,'/api/diary','PUT',{'revision':remote['revision']-1,'state':remote['state']})['status']==409)
                invalid={**remote['state'],'entries':[{**remote['state']['entries'][0],'location':{'name':'Bad','latitude':99,'longitude':0}}]}
                check('server independently rejects invalid coordinates',api(phone,'/api/diary','PUT',{'revision':remote['revision'],'state':invalid})['status']==400)
                bad_strength=json.loads(json.dumps(remote['state']));next(entry for entry in bad_strength['entries'] if entry['type']=='strength')['workout']['exercises'][0]['sets']=-2
                check('server independently rejects invalid working sets',api(phone,'/api/diary','PUT',{'revision':remote['revision'],'state':bad_strength})['status']==400)
                bad_library=json.loads(json.dumps(remote['state']));bad_library['settings']['favoriteExercises'].append('missing-exercise')
                bad_plan=json.loads(json.dumps(remote['state']));bad_plan['settings']['weeklyPlan'][0]['weekday']=7
                check('server independently rejects invalid library references and plan weekdays',api(phone,'/api/diary','PUT',{'revision':remote['revision'],'state':bad_library})['status']==400 and api(phone,'/api/diary','PUT',{'revision':remote['revision'],'state':bad_plan})['status']==400)
                bad_habit=json.loads(json.dumps(remote['state']));bad_habit['settings']['habitChecks'][0]['habitId']='unknown'
                check('server independently rejects fabricated habit records',api(phone,'/api/diary','PUT',{'revision':remote['revision'],'state':bad_habit})['status']==400)
                try:
                    urlopen(Request(base+'/api/logout',data=b'{}',headers={'Content-Type':'application/json','Origin':'https://unrelated.example'},method='POST'))
                    csrf=200
                except HTTPError as error:csrf=error.code
                check('cross-origin state changes are rejected',csrf==403)
                recovery_result=storage(phone,'return s.authenticate("recover",arg)',{'login':login,'password':password+'new','recoveryCode':recovery})
                check('recovery rotates the key and revokes other device sessions',len(recovery_result['recoveryCode'])==64 and api(windows,'/api/diary')['status']==401)
                check('password recovery also revokes the session on the second hostname',api(personal,'/api/diary')['status']==401)
                check('previous recovery key cannot be reused',api(phone,'/api/recover','POST',{'login':login,'password':password,'recoveryCode':recovery})['status']==401)
                storage(phone,'await s.logout()')
                check('logout restores the independent local diary without another account’s data',storage(phone,'return s.getAccount().user') is None and state(phone) is None)
                check('no browser JavaScript errors in cloud and maps flows',not errors)
                browser.close()
        finally:
            import signal
            os.killpg(process.pid,signal.SIGTERM)
            process.wait(timeout=15)
            if stage:shutil.rmtree(stage['directory'])
print(json.dumps({'passed':sum(checks),'failed':len(checks)-sum(checks)}))
