"""Verify the deployed shell in a real browser; surface a concise public CI error."""
import os
import shutil
import socket
import subprocess
import time
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
from build_site import asset_version, source_assets

base=os.environ['TEMPO_BASE_URL']
hostname=urlsplit(base).hostname
expected_version=os.environ.get('TEMPO_EXPECTED_VERSION') or asset_version(source_assets())

def dns_diagnostic():
    # Query only the public application hostname. A CNAME lookup also avoids
    # mistaking a cached old A record for the registrar's current CNAME answer.
    records=[]
    if shutil.which('nslookup'):
        try:
            lookup=subprocess.run(['nslookup','-type=CNAME',hostname],capture_output=True,text=True,timeout=10)
            records.extend(line.strip() for line in lookup.stdout.splitlines() if 'canonical name =' in line)
        except (OSError,subprocess.TimeoutExpired):pass
    try:
        canonical,aliases,addresses=socket.gethostbyname_ex(hostname)
        records.append(f'canonical={canonical}; IPv4={",".join(addresses)}')
    except OSError as error:records.append(f'DNS resolution failed: {error}')
    text=(f'{hostname}: '+ '; '.join(records)).replace('%','%25').replace('\r','%0D').replace('\n','%0A')[:900]
    print(f'::notice title=Public DNS::{text}',flush=True)

dns_diagnostic()
deadline=time.monotonic()+max(1,int(os.environ.get('TEMPO_READY_TIMEOUT_SECONDS','60')))
with sync_playwright() as p:
    executable=os.environ.get('TEMPO_CHROMIUM') or shutil.which('chromium')
    browser=p.chromium.launch(**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
    page=browser.new_page(extra_http_headers={'Cache-Control':'no-cache'})
    try:
        attempt=0
        while True:
            attempt+=1
            try:
                response=page.goto(base,timeout=15000)
                if response is None or response.status!=200:raise AssertionError('HTTP '+str(response.status if response else 'no response'))
                page.locator('#main-nav .nav-item').first.wait_for(timeout=10000)
                if 'Moje tempo' not in page.title():raise AssertionError('Unexpected application title')
                if page.locator('meta[name="tempo-build"]').get_attribute('content')!=expected_version:raise AssertionError('Waiting for the new application release '+expected_version[:12])
                if os.environ.get('TEMPO_REQUIRE_DATABASE')=='1':
                    status=page.request.get(base.rstrip('/')+'/api/status',timeout=10000)
                    if status.status!=200 or status.json().get('available') is not True:raise AssertionError('Production D1 binding is not available')
                    session=page.request.get(base.rstrip('/')+'/api/session',timeout=10000)
                    if session.status!=200 or session.json()!={'user':None}:raise AssertionError('Production D1 account schema is not ready')
                print('Published Moje tempo opens and initializes in Chromium. Release '+expected_version,flush=True)
                print('::notice title=Verified application release::'+hostname+' '+expected_version,flush=True)
                break
            except Exception as error:
                # The target is public. Do not dump cookies, request headers or page contents.
                reason=str(error).splitlines()[0].replace('%','%25').replace('\r','%0D').replace('\n','%0A')[:400]
                print(f'Deployment attempt {attempt}: {reason}',flush=True)
                if time.monotonic()>=deadline:
                    dns_diagnostic()
                    print(f'::error title=Cloudflare application unavailable::{reason}',flush=True)
                    raise SystemExit(1)
                time.sleep(min(5,max(0,deadline-time.monotonic())))
    finally:browser.close()
