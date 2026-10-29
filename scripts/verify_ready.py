"""Verify the deployed shell in a real browser; surface a concise public CI error."""
import os
import shutil
import time
from playwright.sync_api import sync_playwright

base=os.environ['TEMPO_BASE_URL']
with sync_playwright() as p:
    executable=os.environ.get('TEMPO_CHROMIUM') or shutil.which('chromium')
    browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
    page=browser.new_page()
    try:
        for attempt in range(12):
            try:
                response=page.goto(base,timeout=15000)
                if response is None or response.status!=200:raise AssertionError('HTTP '+str(response.status if response else 'no response'))
                page.locator('#main-nav .nav-item').first.wait_for(timeout=10000)
                if 'Moje tempo' not in page.title():raise AssertionError('Unexpected application title')
                print('Published Moje tempo opens and initializes in Chromium.',flush=True)
                break
            except Exception as error:
                # The target is public. Do not dump cookies, request headers or page contents.
                reason=str(error).splitlines()[0].replace('%','%25').replace('\r','%0D').replace('\n','%0A')[:400]
                print(f'Deployment attempt {attempt+1}: {reason}',flush=True)
                if attempt==11:
                    print(f'::error title=Cloudflare application unavailable::{reason}',flush=True)
                    raise SystemExit(1)
                time.sleep(3)
    finally:browser.close()
