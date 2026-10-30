"""Exercise daily logging, exercise favorites, and personal planning through the UI."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import shutil
import subprocess
import tempfile

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
checks = []


def check(name, condition):
    checks.append(bool(condition))
    print(json.dumps({'name': name, 'passed': bool(condition)}, ensure_ascii=False), flush=True)
    if not condition:
        raise AssertionError(name)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


with tempfile.TemporaryDirectory(prefix='tempo-daily-tools-') as temporary:
    output = Path(temporary) / 'public'
    subprocess.run(['python3', 'scripts/build_site.py', '--output-dir', str(output)], cwd=ROOT, check=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(output)))
    server_thread = Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    base = f'http://127.0.0.1:{server.server_address[1]}'
    try:
        with sync_playwright() as playwright:
            chromium = os.environ.get('TEMPO_CHROMIUM') or shutil.which('chromium') or shutil.which('chromium-browser')
            browser = playwright.chromium.launch(**({'executable_path': chromium} if chromium else {}), args=['--no-sandbox'])
            context = browser.new_context(locale='cs-CZ', timezone_id='Europe/Prague', viewport={'width': 1280, 'height': 1000})
            # No external services are needed by these daily workflows.
            context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base + '/') else route.abort())
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base, wait_until='networkidle')
            page.locator('[data-action="start-own"]').click()
            page.locator('.demo-banner').wait_for(state='hidden')

            def diary():
                return page.evaluate('async()=>{const s=await import("./storage.mjs");return s.loadState()}')

            def route(view):
                page.evaluate('(view)=>location.hash=view', view)
                page.locator({'overview': '.today-panel', 'plan': '#plan-form', 'settings': '#settings-form'}[view]).wait_for(state='visible')

            def close_entry():
                page.locator('#entry-dialog [data-action="close-entry"]').first.click()

            def wait_setting(key, expression):
                page.wait_for_function('async arg=>{const s=await import("./storage.mjs");const d=await s.loadState();return ' + expression + '}', arg=key)

            # One click starts a correctly typed and dated log without demo data.
            page.locator('.today-actions [data-action="quick-entry"][data-type="strength"]').click()
            page.locator('#entry-dialog').wait_for(state='visible')
            today = page.evaluate('async()=> (await import("./domain.mjs")).localDate()')
            check('Today opens the chosen activity with today date', page.locator('#entry-type').input_value() == 'strength' and page.locator('#entry-date').input_value() == today)
            page.locator('[data-action="select-exercise"][data-exercise-id="goblet-squat"]').click()
            row = page.locator('.exercise-row').first
            row.locator('.exercise-sets').fill('4')
            check('catalog selection fills its primary pattern and name', row.locator('.exercise-pattern').input_value() == 'squat' and row.locator('.exercise-name').input_value() == 'Goblet dřep')
            page.locator('[data-action="favorite-exercise"][data-exercise-id="goblet-squat"]').click()
            wait_setting(None, 'd.settings.favoriteExercises.includes("goblet-squat")')
            page.locator('#entry-form [name="duration"]').fill('45')
            page.locator('#save-entry').click()
            page.locator('#entry-dialog').wait_for(state='hidden')
            check('working sets save once through the normal diary form', len(diary()['entries']) == 1 and diary()['entries'][0]['workout']['exercises'][0]['sets'] == 4)

            # Reload demonstrates IndexedDB persistence, not just current page memory.
            page.reload(wait_until='networkidle')
            page.locator('.today-actions [data-action="quick-entry"][data-type="strength"]').click()
            favorite = page.locator('[data-exercise-filter="favorites"]')
            check('favorites survive reload and become the initial catalog filter', 'active' in favorite.get_attribute('class'))
            goblet = page.locator('[data-action="select-exercise"][data-exercise-id="goblet-squat"]')
            check('catalog shows actual previous working sets', 'naposledy 4 sérií' in goblet.inner_text())
            goblet.click()
            check('new workout proposes the previous sets without recording them', page.locator('.exercise-sets').input_value() == '4' and len(diary()['entries']) == 1)
            page.locator('[data-action="select-exercise"][data-exercise-id="goblet-squat"]').click()
            check('repeated catalog click does not duplicate working sets', page.locator('.exercise-row').count() == 1)

            # Custom names are treated as text and favorites are account settings.
            page.locator('.exercise-library details summary').click()
            page.locator('#custom-exercise-name').fill('Můj tah <b>vlastní</b>')
            page.locator('#custom-exercise-pattern').select_option('horizontal_pull')
            page.locator('[data-action="save-custom-exercise"]').click()
            wait_setting(None, 'd.settings.customExercises.length===1')
            custom = diary()['settings']['customExercises'][0]
            custom_button = page.locator(f'[data-action="select-exercise"][data-exercise-id="{custom["id"]}"]')
            custom_button.wait_for(state='visible')
            check('custom exercise is safely displayed and favorited', '<b>vlastní</b>' in custom_button.inner_text() and custom_button.locator('b').count() == 0 and custom['id'] in diary()['settings']['favoriteExercises'])
            close_entry()

            page.locator('[data-action="yesterday-steps"]').click()
            yesterday = page.evaluate('async()=>{const d=new Date();d.setDate(d.getDate()-1);return (await import("./domain.mjs")).localDate(d)}')
            check('yesterday steps opens yesterday with untimed step entry', page.locator('#entry-type').input_value() == 'steps' and page.locator('#entry-date').input_value() == yesterday and not page.locator('#entry-duration-field').is_visible())
            page.locator('#entry-form [name="steps"]').fill('6500')
            page.locator('#save-entry').click()
            page.locator('#entry-dialog').wait_for(state='hidden')
            check('yesterday steps are not added to today', diary()['entries'][-1]['date'] == yesterday and diary()['entries'][-1]['duration'] == 0)

            # Personal plan supports work as well as movement without fake diary logs.
            route('plan')
            weekday = page.evaluate('()=>String((new Date().getDay()+6)%7)')
            page.locator('#plan-form [name="weekday"]').select_option(weekday)
            page.locator('#plan-form [name="type"]').select_option('other')
            page.locator('#plan-form [name="label"]').fill('Práce / soustředění')
            page.locator('#plan-form [type="submit"]').click()
            wait_setting(None, 'd.settings.weeklyPlan.length===1')
            plan_id = diary()['settings']['weeklyPlan'][0]['id']
            page.locator(f'[data-action="toggle-plan"][data-plan-id="{plan_id}"]').click()
            wait_setting(None, 'd.settings.planChecks.length===1')
            check('plan check records completion without inventing activity volume', diary()['settings']['planChecks'][0]['date'] == today and len(diary()['entries']) == 2)
            route('overview')
            check('Today displays the actual completed personal plan', page.locator('.plan-today .plan-item.is-complete').count() == 1 and 'Práce / soustředění' in page.locator('.plan-today').inner_text())

            # Mapping pool to cardio still preserves the user's planned label.
            route('plan')
            page.locator('#plan-form [name="weekday"]').select_option(weekday)
            page.locator('#plan-form [name="type"]').select_option('cardio')
            page.locator('#plan-form [name="label"]').fill('Můj bazén')
            page.locator('#plan-form [type="submit"]').click()
            wait_setting(None, 'd.settings.weeklyPlan.length===2')
            pool_id = diary()['settings']['weeklyPlan'][1]['id']
            page.locator(f'[data-action="plan-log"][data-plan-id="{pool_id}"]').click()
            page.locator('#entry-dialog').wait_for(state='visible')
            check('planned activity opens its matching type date and personal label', page.locator('#entry-type').input_value() == 'cardio' and page.locator('#entry-date').input_value() == today and page.locator('#entry-form [name="title"]').input_value() == 'Můj bazén')
            close_entry()

            # Goals and other setting collections must not overwrite one another.
            before = diary()['settings']
            route('settings')
            page.locator('#settings-form [name="weeklyMinutes"]').fill('180')
            page.locator('#settings-form [type="submit"]').click()
            wait_setting(None, 'd.settings.weeklyMinutes===180')
            after = diary()['settings']
            preserved = all(after[key] == before[key] for key in ['favoriteExercises', 'customExercises', 'weeklyPlan', 'planChecks'])
            check('saving goals preserves exercise library plan and checks', preserved)
            page.reload(wait_until='networkidle')
            check('all new settings survive a full application reload', all(diary()['settings'][key] == after[key] for key in ['favoriteExercises', 'customExercises', 'weeklyPlan', 'planChecks']))

            # The same flows fit a normal mobile viewport without horizontal scroll.
            page.set_viewport_size({'width': 390, 'height': 844})
            route('overview')
            check('Today and personal plan fit mobile width', page.evaluate('()=>document.documentElement.scrollWidth<=window.innerWidth'))
            page.locator('.today-actions [data-action="quick-entry"][data-type="strength"]').click()
            check('exercise library and editor fit mobile width', page.locator('#entry-dialog').evaluate('(el)=>el.scrollWidth<=el.clientWidth+1'))
            close_entry()
            check('daily tools raise no uncaught browser errors', not errors)
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        server_thread.join(timeout=5)

print(json.dumps({'summary': {'passed': sum(checks), 'total': len(checks)}}), flush=True)
