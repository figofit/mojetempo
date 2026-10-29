from playwright.sync_api import sync_playwright
from pathlib import Path
import os
import shutil
import tempfile
import json
import struct
import zlib
import time

BASE = os.environ.get('TEMPO_BASE_URL', 'http://127.0.0.1:8000').rstrip('/') + '/'
_artifacts = tempfile.TemporaryDirectory(prefix='tempo-smoke-')
OUT = Path(_artifacts.name)
checks = []
pageerrors = []
requests_failed = []

def png_chunk(kind, payload):
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)

fixture = OUT / 'moment.png'
fixture.write_bytes(b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0)) + png_chunk(b'IDAT', zlib.compress(b'\x00\x17\x6b\x5b\xc5\xed\xb3' * 2)) + png_chunk(b'IEND', b''))

def check(name, condition, observed=None):
    checks.append({'name': name, 'passed': bool(condition), 'observed': observed})
    print(json.dumps(checks[-1], ensure_ascii=False), flush=True)

with sync_playwright() as p:
    chromium = os.environ.get('TEMPO_CHROMIUM') or shutil.which('chromium') or shutil.which('chromium-browser')
    launch_options = {'headless': True, 'args': ['--no-sandbox']}
    if chromium:
        launch_options['executable_path'] = chromium
    browser = p.chromium.launch(**launch_options)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='cs-CZ', timezone_id='Europe/Prague', accept_downloads=True)
    page = context.new_page()
    page.on('pageerror', lambda e: pageerrors.append(str(e)))
    page.on('requestfailed', lambda r: requests_failed.append({'url': r.url, 'failure': r.failure}))
    try:
        def state():
            return page.evaluate("async () => (await import('./storage.mjs')).loadState()")

        def route(name):
            page.evaluate('(name) => location.hash = name', name)
            page.wait_for_function('(name) => document.querySelector("#breadcrumb-current").textContent === name', arg={'overview':'Přehled','diary':'Deník aktivit','chronicle':'Moje kronika','stats':'Statistiky','modules':'Moje moduly','settings':'Cíle a nastavení'}[name])

        def wait_entries(count):
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                current = state()
                if current is not None and len(current['entries']) == count:
                    return
                page.wait_for_timeout(50)
            raise AssertionError(f'Expected {count} entries, found {state()}')

        def create_entry(kind, duration, title, photo=False, steps=''):
            page.locator('[data-action="add"]').first.click()
            page.locator('#entry-dialog').wait_for(state='visible')
            page.locator('#entry-type').select_option(kind)
            page.locator('#entry-form [name="duration"]').fill(str(duration))
            page.locator('#entry-form [name="steps"]').fill(str(steps))
            page.locator('#entry-form [name="title"]').fill(title)
            page.locator('#entry-form [name="note"]').fill('Moje poznámka: <b>malé vítězství</b> & radost.')
            page.locator('.mood-option').nth(3).click()
            if photo:
                page.locator('#entry-photo').set_input_files(str(fixture))
            page.locator('#save-entry').click()
            page.locator('#entry-dialog').wait_for(state='hidden')

        def download(action, filename):
            with page.expect_download() as d:
                page.locator(f'[data-action="{action}"]').first.click()
            path = OUT / filename
            d.value.save_as(path)
            return path

        def do_import(path, accept):
            with page.expect_file_chooser() as chosen:
                page.locator('[data-action="import"]').click()
            with page.expect_event('dialog') as shown:
                chosen.value.set_files(str(path))
            dialog = shown.value
            message = dialog.message
            dialog.accept() if accept else dialog.dismiss()
            page.wait_for_timeout(200)
            return [message]

        page.goto(BASE, wait_until='networkidle')
        check('initial demo clearly labeled', page.locator('#demo-banner').inner_text().find('ukázkový deník') >= 0 and page.locator('.nav-count').inner_text() != '0', page.locator('#demo-banner').inner_text())
        check('demo entries are not own records', state() is None, state())
        page.locator('[data-action="start-own"]').click()
        wait_entries(0)
        check('start own diary removes demo from view', not page.locator('.demo-banner').count() and state()['entries'] == [], state())

        create_entry('walking', 45, 'QA procházka <test>', True, 5000)
        wait_entries(1)
        check('movement with photo saved', len(state()['entries']) == 1 and bool(state()['entries'][0].get('photoId')), state()['entries'])
        create_entry('sauna', 20, 'QA sauna')
        wait_entries(2)
        check('recovery saved separately', sorted(e['type'] for e in state()['entries']) == ['sauna', 'walking'])
        cards = {item.locator('.stat-label').inner_text(): item.locator('.stat-value').inner_text().replace('\n', '') for item in page.locator('.stat-card').all()}
        check('movement and recovery stats separated', cards.get('Minuty pohybu') == '45min' and cards.get('Pohybové aktivity') == '1' and cards.get('Čas na regeneraci') == '1×' and cards.get('Dnešní kroky') == '5\xa0000', cards)
        check('weekly graph contains separate categories', page.locator('[title="Pohyb: 45 min"]').count() == 1 and page.locator('[title="Regenerace: 20 min"]').count() == 1)

        route('chronicle')
        page.wait_for_function('document.querySelector(".timeline-photo")?.naturalWidth > 0')
        check('photo displayed in chronicle', page.locator('.timeline-photo').evaluate('(img) => img.naturalWidth > 0'), page.locator('.timeline-photo').get_attribute('src'))
        check('notes and titles rendered as text', page.locator('.timeline-body').filter(has_text='QA procházka <test>').count() == 1 and page.locator('.timeline-body b').count() == 0)
        page.reload(wait_until='networkidle')
        page.wait_for_function('document.querySelector(".timeline-photo")?.naturalWidth > 0')
        check('records and photo persist reload', len(state()['entries']) == 2 and page.locator('.timeline-photo').evaluate('(img) => img.naturalWidth > 0'))

        page.locator('#demo-toggle').click()
        check('demo can be reopened alongside own data', bool(page.locator('.demo-banner').count()) and len(state()['entries']) == 2)
        page.locator('[data-action="start-own"]').click()
        page.wait_for_function('!document.querySelector(".demo-banner")')
        check('start own preserves existing own records', len(state()['entries']) == 2)

        route('settings')
        for key, val in {'weeklyMinutes':200,'weeklySessions':4,'weeklyRecovery':3,'dailySteps':6000}.items():
            page.locator(f'#settings-form [name="{key}"]').fill(str(val))
        page.locator('#settings-form button').click()
        page.wait_for_function("async () => (await (await import('./storage.mjs')).loadState()).settings.weeklyMinutes === 200")
        page.reload(wait_until='networkidle')
        check('custom goals persist reload', {k:state()['settings'][k] for k in ['weeklyMinutes','weeklySessions','weeklyRecovery','dailySteps']} == {'weeklyMinutes':200,'weeklySessions':4,'weeklyRecovery':3,'dailySteps':6000}, state()['settings'])

        route('modules')
        page.locator('[data-module="recovery"]').locator('..').click()
        page.wait_for_function("async () => !(await (await import('./storage.mjs')).loadState()).settings.modules.includes('recovery')")
        route('diary')
        check('disabling recovery hides its records without deletion', page.locator('.activity-row').count() == 1 and len(state()['entries']) == 2)
        route('modules')
        page.locator('[data-module="recovery"]').locator('..').click()
        page.wait_for_function("async () => (await (await import('./storage.mjs')).loadState()).settings.modules.includes('recovery')")
        route('diary')
        check('enabling recovery restores records', page.locator('.activity-row').count() == 2)
        route('modules')
        page.locator('[data-module="chronicle"]').locator('..').click()
        page.wait_for_function("async () => !(await (await import('./storage.mjs')).loadState()).settings.modules.includes('chronicle')")
        route('chronicle')
        check('chronicle module can be hidden', 'Kronika je právě vypnutá.' in page.locator('#view-content').inner_text() and page.locator('.timeline-photo').count() == 0 and len(state()['entries']) == 2)
        route('modules')
        page.locator('[data-module="chronicle"]').locator('..').click()
        page.wait_for_function("async () => (await (await import('./storage.mjs')).loadState()).settings.modules.includes('chronicle')")
        route('chronicle')
        page.wait_for_function('document.querySelector(".timeline-photo")?.naturalWidth > 0')
        check('chronicle photo restored when module enabled', page.locator('.timeline-photo').evaluate('(img) => img.naturalWidth > 0'))

        route('diary')
        csv = download('csv', 'diary.csv').read_text(encoding='utf-8-sig')
        check('CSV downloads with both own records', 'QA procházka <test>' in csv and 'QA sauna' in csv and 'Ukázkový' not in csv, csv)
        ics = download('ics', 'diary.ics').read_text()
        check('calendar file contains two events', ics.count('BEGIN:VEVENT') == 2 and 'BEGIN:VCALENDAR' in ics and 'QA sauna' in ics, ics)
        route('settings')
        backup_path = download('backup', 'backup.json')
        backup = json.loads(backup_path.read_text())
        check('full backup includes entries goals modules and photo', len(backup['entries']) == 2 and backup['settings']['weeklyMinutes'] == 200 and len(backup['photos']) == 1 and next(iter(backup['photos'].values())).startswith('data:image/jpeg;base64,'), {'entries':len(backup['entries']), 'photo_count':len(backup['photos']), 'settings':backup['settings']})

        route('diary')
        page.once('dialog', lambda d: d.dismiss())
        page.locator('.activity-row').filter(has_text='QA sauna').locator('[data-action="delete"]').click()
        check('rejecting delete preserves record', len(state()['entries']) == 2)
        page.once('dialog', lambda d: d.accept())
        page.locator('.activity-row').filter(has_text='QA sauna').locator('[data-action="delete"]').click()
        wait_entries(1)
        check('confirmed delete removes selected record only', len(state()['entries']) == 1 and state()['entries'][0]['type'] == 'walking')
        route('settings')
        dialogs = do_import(backup_path, False)
        check('canceling import preserves current diary', len(dialogs) == 1 and len(state()['entries']) == 1, dialogs)
        dialogs = do_import(backup_path, True)
        wait_entries(2)
        check('confirmed backup import restores records and settings', len(dialogs) == 1 and len(state()['entries']) == 2 and state()['settings']['weeklyMinutes'] == 200, dialogs)
        route('chronicle')
        page.wait_for_function('document.querySelector(".timeline-photo")?.naturalWidth > 0')
        check('import restores actual photo bytes', page.locator('.timeline-photo').evaluate('(img) => img.naturalWidth > 0'))

        before = state()
        invalid = json.loads(json.dumps(backup))
        invalid['entries'][0]['duration'] = -1
        invalid_path = OUT / 'invalid.json'
        invalid_path.write_text(json.dumps(invalid))
        page.locator('#import-file').set_input_files(str(invalid_path))
        page.wait_for_function('document.querySelector("#toast").getAttribute("role") === "alert"')
        check('invalid import rejected without modifying original', state() == before and 'neplatný záznam' in page.locator('#toast').inner_text(), page.locator('#toast').inner_text())
        page.reload(wait_until='networkidle')
        page.wait_for_function('document.querySelector(".timeline-photo")?.naturalWidth > 0')
        check('imported records and photo persist reload', len(state()['entries']) == 2 and page.locator('.timeline-photo').evaluate('(img) => img.naturalWidth > 0'))

        route('settings')
        restored_backup = json.loads(download('backup', 'roundtrip.json').read_text())
        check('photo bytes survive backup roundtrip exactly', sorted(backup['photos'].values()) == sorted(restored_backup['photos'].values()))

        route('overview')
        page.locator('[data-action="add"]').first.click()
        page.locator('#entry-type').select_option('steps')
        check('independent steps hide duration and require count', not page.locator('#entry-duration-field').is_visible() and page.locator('#entry-form [name="steps"]').get_attribute('required') is not None)
        page.locator('#entry-form [name="steps"]').fill('0')
        page.locator('#save-entry').click()
        check('zero independent steps rejected', page.locator('#entry-dialog').is_visible() and 'kladný počet kroků' in page.locator('#entry-error').inner_text() and len(state()['entries']) == 2)
        page.locator('#entry-form [name="steps"]').fill('3000')
        page.locator('#entry-form [name="title"]').fill('QA samostatné kroky')
        page.locator('#save-entry').click()
        page.locator('#entry-dialog').wait_for(state='hidden')
        wait_entries(3)
        check('independent steps save zero duration', state()['entries'][-1]['type'] == 'steps' and state()['entries'][-1]['duration'] == 0 and state()['entries'][-1]['steps'] == 3000)

        page.locator('[data-action="add"]').first.click()
        page.locator('#entry-type').select_option('moment')
        check('chronicle moment hides duration and steps', not page.locator('#entry-duration-field').is_visible() and not page.locator('#entry-steps-field').is_visible())
        page.locator('#save-entry').click()
        check('empty chronicle moment rejected', page.locator('#entry-dialog').is_visible() and 'potřebuje název' in page.locator('#entry-error').inner_text() and len(state()['entries']) == 3)
        page.locator('#entry-form [name="title"]').fill('QA moment bez minut')
        page.locator('#save-entry').click()
        page.locator('#entry-dialog').wait_for(state='hidden')
        wait_entries(4)
        check('chronicle moment saves zero duration', state()['entries'][-1]['type'] == 'moment' and state()['entries'][-1]['duration'] == 0 and state()['entries'][-1]['steps'] == 0)

        page.locator('[data-action="add"]').first.click()
        page.locator('#entry-type').select_option('moment')
        page.locator('#entry-photo').set_input_files(str(fixture))
        page.locator('#save-entry').click()
        page.locator('#entry-dialog').wait_for(state='hidden')
        wait_entries(5)
        check('photo-only chronicle moment accepted', state()['entries'][-1]['type'] == 'moment' and bool(state()['entries'][-1].get('photoId')) and not state()['entries'][-1]['title'] and not state()['entries'][-1]['note'])
        cards = {item.locator('.stat-label').inner_text(): item.locator('.stat-value').inner_text().replace('\n', '') for item in page.locator('.stat-card').all()}
        check('steps and moments receive no workout credit', cards.get('Minuty pohybu') == '45min' and cards.get('Pohybové aktivity') == '1' and cards.get('Čas na regeneraci') == '1×' and cards.get('Dnešní kroky') == '8\xa0000', cards)
        route('modules')
        for category in ('movement', 'recovery'):
            page.locator(f'[data-module="{category}"]').locator('..').click()
            page.wait_for_function("async (category) => !(await (await import('./storage.mjs')).loadState()).settings.modules.includes(category)", arg=category)
        route('diary')
        check('independent records visible with movement and recovery disabled', page.locator('.activity-row').count() == 3 and len(state()['entries']) == 5)
        page.locator('[data-action="add"]').first.click()
        check('independent modules remain usable alone', page.locator('#entry-type option').evaluate_all('(items) => items.map(x => x.value)') == ['steps', 'moment'])
        page.locator('[data-action="close-entry"]').first.click()
        route('settings')
        all_backup = json.loads(download('backup', 'all-modules.json').read_text())
        check('backup includes hidden modules and independent entries', len(all_backup['entries']) == 5 and len(all_backup['photos']) == 2)
        for category in ('movement', 'recovery'):
            route('modules')
            page.locator(f'[data-module="{category}"]').locator('..').click()
            page.wait_for_function("async (category) => (await (await import('./storage.mjs')).loadState()).settings.modules.includes(category)", arg=category)
        route('settings')
        dialogs = do_import(OUT / 'all-modules.json', True)
        wait_entries(5)
        check('independent entries and photo-only moment import', len(dialogs) == 1 and sorted(e['type'] for e in state()['entries']) == ['moment', 'moment', 'sauna', 'steps', 'walking'])
        # Restore categories after importing the intentionally disabled-module backup.
        for category in ('movement', 'recovery'):
            route('modules')
            page.locator(f'[data-module="{category}"]').locator('..').click()
            page.wait_for_function("async (category) => (await (await import('./storage.mjs')).loadState()).settings.modules.includes(category)", arg=category)

        for width in (1440, 390):
            page.set_viewport_size({'width': width, 'height': 900})
            for name in ('overview','diary','chronicle','stats','modules','settings'):
                route(name)
                dims = page.evaluate('({width:innerWidth, scroll:document.documentElement.scrollWidth, body:document.body.scrollWidth})')
                check(f'{name} route at {width}px has no horizontal overflow', dims['scroll'] <= width + 1 and dims['body'] <= width + 1 and page.locator('#view-content h1').is_visible(), dims)
        check('no browser JavaScript errors', not pageerrors, pageerrors)
        check('no failed asset requests', not requests_failed, requests_failed)
    except Exception as e:
        checks.append({'name':'unhandled smoke exception','passed':False,'observed':repr(e)})
        page.screenshot(path=str(OUT / 'failure.png'), full_page=True)
        print(json.dumps(checks[-1], ensure_ascii=False), flush=True)
    finally:
        context.close()
        browser.close()

report = {'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),'checks':checks,'pageerrors':pageerrors,'failed_requests':requests_failed}
(OUT / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({'passed':report['passed'],'failed':report['failed']},ensure_ascii=False))
_artifacts.cleanup()
raise SystemExit(1 if report['failed'] else 0)
