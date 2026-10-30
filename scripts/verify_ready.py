"""Verify the deployed shell in a real browser; surface a concise public CI error."""
import os
import shutil
import time
from playwright.sync_api import sync_playwright

base=os.environ['TEMPO_BASE_URL']
deadline=time.monotonic()+max(1,int(os.environ.get('TEMPO_READY_TIMEOUT_SECONDS','60')))
with sync_playwright() as p:
    executable=os.environ.get('TEMPO_CHROMIUM') or shutil.which('chromium')
    browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
    page=browser.new_page()
    try:
        attempt=0
        while True:
            attempt+=1
            try:
                response=page.goto(base,timeout=15000)
                if response is None or response.status!=200:raise AssertionError('HTTP '+str(response.status if response else 'no response'))
                page.locator('#main-nav .nav-item').first.wait_for(timeout=10000)
                if 'Moje tempo' not in page.title():raise AssertionError('Unexpected application title')
                if os.environ.get('TEMPO_REQUIRE_DATABASE')=='1':
                    status=page.request.get(base.rstrip('/')+'/api/status',timeout=10000)
                    if status.status!=200 or status.json().get('available') is not True:raise AssertionError('Production D1 binding is not available')
                    session=page.request.get(base.rstrip('/')+'/api/session',timeout=10000)
                    if session.status!=200 or session.json()!={'user':None}:raise AssertionError('Production D1 account schema is not ready')
                print('Published Moje tempo opens and initializes in Chromium.',flush=True)
                break
            except Exception as error:
                # The target is public. Do not dump cookies, request headers or page contents.
                reason=str(error).splitlines()[0].replace('%','%25').replace('\r','%0D').replace('\n','%0A')[:400]
                print(f'Deployment attempt {attempt}: {reason}',flush=True)
                if time.monotonic()>=deadline:
                    print(f'::error title=Cloudflare application unavailable::{reason}',flush=True)
                    raise SystemExit(1)
                time.sleep(min(5,max(0,deadline-time.monotonic())))
    finally:browser.close()
