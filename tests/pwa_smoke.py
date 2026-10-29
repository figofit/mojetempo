#!/usr/bin/env python3
"""Exercise the built PWA at a GitHub Pages subpath, including offline updates.

Requires Python Playwright and Chromium. Uses its own temporary build/server,
browser context, IndexedDB, caches and fixture photo; never changes app sources.
TEMPO_CHROMIUM optionally selects a browser executable.
"""

from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import threading
import zlib

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent.parent
CHECKS: list[dict] = []


def check(name: str, condition: bool, observed=None) -> None:
    CHECKS.append({"name": name, "passed": bool(condition), "observed": observed})
    print(json.dumps(CHECKS[-1], ensure_ascii=False), flush=True)
    if not condition:
        raise AssertionError(name)


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def photo_fixture(path: Path) -> None:
    row = b"\x00\x17\x6b\x5b\xc5\xed\xb3"
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0))
        + png_chunk(b"IDAT", zlib.compress(row * 2))
        + png_chunk(b"IEND", b"")
    )


def build(script: Path, destination: Path) -> str:
    completed = subprocess.run(
        [sys.executable, str(script), "--output-dir", str(destination)],
        cwd=script.parent.parent,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode:
        raise RuntimeError(completed.stdout + completed.stderr)
    return json.loads((destination / ".tempo-build.json").read_text())["version"]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        pass

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/hubnuti/private.json":
            body = b'{"private":"must never enter the shell cache"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main() -> int:
    page_errors: list[str] = []
    with tempfile.TemporaryDirectory(prefix="tempo-pwa-smoke-") as directory:
        temporary = Path(directory)
        public = temporary / "public"
        output = public / "hubnuti"
        version_one = build(ROOT / "scripts/build_site.py", output)
        fixture = temporary / "photo.png"
        photo_fixture(fixture)
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(public)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}/hubnuti/"
        try:
            with sync_playwright() as playwright:
                options = {"headless": True, "args": ["--no-sandbox"]}
                chromium = os.environ.get("TEMPO_CHROMIUM") or shutil.which("chromium") or shutil.which("chromium-browser")
                if chromium:
                    options["executable_path"] = chromium
                # A disposable profile is isolated from user data while allowing
                # installability diagnostics (incognito contexts disable installs).
                context = playwright.chromium.launch_persistent_context(
                    str(temporary / "profile"), **options,
                    locale="cs-CZ", timezone_id="Europe/Prague",
                    viewport={"width": 1280, "height": 900},
                )
                page = context.new_page()
                page.set_default_timeout(10000)
                page.on("pageerror", lambda error: page_errors.append(str(error)))
                try:
                    page.goto(base, wait_until="networkidle")
                    page.wait_for_function("navigator.serviceWorker.controller !== null")
                    registration = page.evaluate("async () => { const r = await navigator.serviceWorker.ready; return {scope:r.scope,script:r.active.scriptURL,state:r.active.state}; }")
                    check("production build stamped with its actual hash", page.locator('meta[name="tempo-build"]').get_attribute("content") == version_one and "__TEMPO_VERSION__" not in (output / "service-worker.js").read_text())
                    check("service worker controls the GitHub Pages subpath", registration == {"scope": base, "script": base + "service-worker.js", "state": "activated"}, registration)

                    manifest = page.evaluate("async () => { const link=document.querySelector('link[rel=manifest]'); return {url:link.href,data:await (await fetch(link.href)).json()}; }")
                    data = manifest["data"]
                    check("manifest is scoped and starts at the app directory", manifest["url"] == base + "manifest.webmanifest" and data["scope"] == "./" and data["start_url"] == "./" and data["id"] == "./" and data["display"] == "standalone" and bool(data["name"]) and bool(data["short_name"]), data)
                    icons = page.evaluate("""async () => {
                        const manifest = await (await fetch('./manifest.webmanifest')).json();
                        return Promise.all(manifest.icons.map(async icon => {
                            const response=await fetch(icon.src); const bitmap=await createImageBitmap(await response.blob());
                            const result={size:icon.sizes,purpose:icon.purpose,width:bitmap.width,height:bitmap.height,type:icon.type};
                            bitmap.close();return result;
                        }));
                    }""")
                    check("install icons decode at required sizes with a maskable icon", any(i["width"] == 192 and i["height"] == 192 and i["purpose"] == "any" for i in icons) and any(i["width"] == 512 and i["height"] == 512 and i["purpose"] == "any" for i in icons) and any(i["width"] == 512 and i["height"] == 512 and i["purpose"] == "maskable" for i in icons), icons)
                    cdp = context.new_cdp_session(page)
                    manifest_errors = cdp.send("Page.getAppManifest").get("errors", [])
                    install_errors = cdp.send("Page.getInstallabilityErrors").get("installabilityErrors", [])
                    check("Chromium reports a valid installable manifest", not manifest_errors and not install_errors, {"manifest": manifest_errors, "installability": install_errors})
                    cdp.detach()

                    initial_caches = page.evaluate("() => caches.keys()")
                    own_prefix = "moje-tempo-shell:%2Fhubnuti%2F:"
                    check("one complete shell cache exists for this scope", len([key for key in initial_caches if key.startswith(own_prefix)]) == 1 and version_one in initial_caches[0], initial_caches)
                    shell_paths = page.evaluate("async () => { const names=await caches.keys();const cache=await caches.open(names.find(name=>name.includes('%2Fhubnuti%2F')));return (await cache.keys()).map(request=>new URL(request.url).pathname); }")
                    check("shell cache contains local modules manifest and icons", all("/hubnuti/" + path in shell_paths for path in ("index.html", "app.js", "domain.mjs", "storage.mjs", "pwa.mjs", "styles.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png")), shell_paths)

                    page.locator('[data-action="start-own"]').click()
                    page.locator('[data-action="add"]').first.click()
                    page.locator('#entry-type').select_option("walking")
                    page.locator('#entry-form [name="duration"]').fill("35")
                    page.locator('#entry-form [name="steps"]').fill("4200")
                    page.locator('#entry-form [name="title"]').fill("PWA uchovaná procházka")
                    page.locator('#entry-form [name="note"]').fill("Fotografie zůstává lokálně i bez připojení.")
                    page.locator('#entry-photo').set_input_files(str(fixture))
                    page.locator('#save-entry').click()
                    page.locator('#entry-dialog').wait_for(state="hidden")
                    saved = page.evaluate("async () => (await import('./storage.mjs')).loadState()")
                    check("own entry and photo persisted before going offline", len(saved["entries"]) == 1 and bool(saved["entries"][0].get("photoId")), saved["entries"])
                    photo_bytes = page.evaluate("async (id) => Array.from(new Uint8Array(await (await (await import('./storage.mjs')).getPhoto(id)).arrayBuffer()))", saved["entries"][0]["photoId"])

                    private = page.evaluate("async () => (await fetch('./private.json')).json()")
                    check("unknown network response can be requested without being cached", private["private"].startswith("must never") and not page.evaluate("async () => Boolean(await caches.match(new URL('./private.json',location.href).href))"))
                    sibling_caches = ["other-app-cache-v1", "moje-tempo-shell:%2Fanother-app%2F:old-version"]
                    page.evaluate("async (names) => { for(const name of names) { const cache=await caches.open(name);await cache.put(new URL('/another-app/preserved.txt',location.origin),new Response('keep me')); } }", sibling_caches)
                    context.set_offline(True)
                    page.goto(base + "#chronicle", wait_until="networkidle")
                    page.wait_for_function("document.querySelector('.timeline-photo')?.naturalWidth > 0")
                    offline_state = page.evaluate("async () => (await import('./storage.mjs')).loadState()")
                    check("offline reload loads the application and own diary", offline_state == saved and page.locator(".timeline-card").count() == 1 and page.locator(".timeline-card").inner_text().find("PWA uchovaná procházka") >= 0)
                    check("offline reload renders the saved photo", page.locator(".timeline-photo").evaluate("image => image.complete && image.naturalWidth === 2"))
                    check("offline status is visible", "bez připojení" in page.locator("#pwa-status").inner_text())
                    unknown_offline = page.evaluate("async () => { try {await fetch('./private.json');return 'unexpectedly available';} catch {return 'network unavailable';} }")
                    check("unknown response is unavailable offline", unknown_offline == "network unavailable", unknown_offline)
                    context.set_offline(False)
                    page.wait_for_function("navigator.onLine && !document.querySelector('#pwa-status').textContent.trim()")

                    page.locator('[data-action="add"]').first.click()
                    page.locator('#entry-form [name="title"]').fill("Rozepsáno před aktualizací")
                    page.locator('#entry-form [name="duration"]').fill("25")
                    token = page.evaluate("() => window.__tempoSmokeDocument = crypto.randomUUID()")

                    # Build a second real production version from copied sources. The
                    # harmless CSS custom property gives the new shell an observable stamp.
                    source_two = temporary / "source-two"
                    (source_two / "scripts").mkdir(parents=True)
                    shutil.copy2(ROOT / "scripts/build_site.py", source_two / "scripts/build_site.py")
                    for item in output.rglob("*"):
                        if item.is_file() and item.name not in {".nojekyll", ".tempo-build.json"}:
                            relative = item.relative_to(output)
                            destination = source_two / relative
                            destination.parent.mkdir(parents=True, exist_ok=True)
                            # Copy source templates, so the real builder computes a new hash.
                            shutil.copy2(ROOT / relative, destination)
                    with (source_two / "styles.css").open("a") as stylesheet:
                        stylesheet.write("\n/* PWA smoke: harmless version marker. */\n:root { --tempo-pwa-smoke-version: v2; }\n")
                    version_two = build(source_two / "scripts/build_site.py", output)
                    check("second production build has a distinct consistent version", version_two != version_one and version_two in (output / "index.html").read_text() and version_two in (output / "service-worker.js").read_text())
                    page.evaluate("async () => { const registration=await navigator.serviceWorker.getRegistration(); await registration.update(); }")
                    page.locator('[data-action="update-app"]').wait_for(state="attached")
                    check("updated worker is installed and waiting", page.evaluate("async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)"))
                    check("new version waits without reloading an unsaved dialog", page.evaluate("window.__tempoSmokeDocument") == token and page.locator('#entry-dialog').is_visible() and page.locator('#entry-form [name="title"]').input_value() == "Rozepsáno před aktualizací" and page.locator('meta[name="tempo-build"]').get_attribute("content") == version_one)
                    # Native modal dialogs make background controls inert. Dispatch a
                    # click through the real app handler to exercise its explicit guard.
                    page.evaluate("document.querySelector('[data-action=update-app]').click()")
                    page.wait_for_function("document.querySelector('#toast').textContent.includes('rozepsaný formulář')")
                    check("explicit update is blocked while a dialog is open", page.evaluate("window.__tempoSmokeDocument") == token and page.locator('#entry-dialog').is_visible() and page.locator('#entry-form [name="title"]').input_value() == "Rozepsáno před aktualizací" and page.evaluate("async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)"))
                    page.locator('[data-action="close-entry"]').first.click()
                    with page.expect_navigation(wait_until="networkidle"):
                        page.locator('[data-action="update-app"]').click()
                    page.wait_for_function("(version) => document.querySelector('meta[name=tempo-build]').content === version && navigator.serviceWorker.controller !== null", arg=version_two)
                    check("explicit update activates and reloads the new shell", page.evaluate("typeof window.__tempoSmokeDocument") == "undefined" and page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--tempo-pwa-smoke-version').trim()") == "v2")
                    after_update = page.evaluate("async () => (await import('./storage.mjs')).loadState()")
                    check("explicit update preserves diary entries and excludes the unsaved draft", after_update == saved)
                    updated_photo_bytes = page.evaluate("async (id) => Array.from(new Uint8Array(await (await (await import('./storage.mjs')).getPhoto(id)).arrayBuffer()))", saved["entries"][0]["photoId"])
                    check("explicit update preserves the exact stored photo bytes", updated_photo_bytes == photo_bytes)
                    keys_after_update = page.evaluate("() => caches.keys()")
                    own_after_update = [key for key in keys_after_update if key.startswith(own_prefix)]
                    check("activation keeps only the latest cache for this app scope", len(own_after_update) == 1 and version_two in own_after_update[0] and not any(version_one in key for key in own_after_update), keys_after_update)
                    check("activation preserves unrelated and sibling-app caches", all(key in keys_after_update for key in sibling_caches) and page.evaluate("async (names) => (await Promise.all(names.map(async name => (await (await caches.open(name)).match(new URL('/another-app/preserved.txt',location.origin))).text()))).every(value=>value==='keep me')", sibling_caches))
                    check("unknown URLs still absent from all shell caches", not page.evaluate("async () => Boolean(await caches.match(new URL('./private.json',location.href).href))"))

                    # Serve a third version whose CSS bytes no longer match the
                    # builder's signed-off integrity map, as with a stale CDN asset.
                    with (source_two / "styles.css").open("a") as stylesheet:
                        stylesheet.write("\n:root { --tempo-pwa-smoke-version: v3; }\n")
                    version_three = build(source_two / "scripts/build_site.py", output)
                    with (output / "styles.css").open("a") as stylesheet:
                        stylesheet.write("\n/* Simulated stale/corrupt server response after build. */\n")
                    page.evaluate("""async () => {
                        window.__tempoRejectedWorkerState = 'not observed';
                        const registration=await navigator.serviceWorker.getRegistration();
                        const observe=()=>{
                            const worker=registration.installing;
                            if(!worker)return;
                            window.__tempoRejectedWorkerState=worker.state;
                            worker.addEventListener('statechange',()=>window.__tempoRejectedWorkerState=worker.state);
                        };
                        registration.addEventListener('updatefound',observe,{once:true});
                        await registration.update();
                        observe();
                    }""")
                    page.wait_for_function("window.__tempoRejectedWorkerState === 'redundant'")
                    check("corrupt shell asset fails the new worker installation", not page.evaluate("async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)") and page.locator('meta[name="tempo-build"]').get_attribute("content") == version_two)
                    check("failed installation preserves the active diary and photo", page.evaluate("async () => (await import('./storage.mjs')).loadState()") == saved and page.evaluate("async (id) => Array.from(new Uint8Array(await (await (await import('./storage.mjs')).getPhoto(id)).arrayBuffer()))", saved["entries"][0]["photoId"]) == photo_bytes)
                    failed_cache_requests = page.evaluate("async (version) => {const name=(await caches.keys()).find(key=>key.includes(version));return name?(await (await caches.open(name)).keys()).map(request=>request.url):[];}", version_three)
                    check("failed integrity check exposes no partially cached new shell", failed_cache_requests == [], failed_cache_requests)
                    context.set_offline(True)
                    page.reload(wait_until="networkidle")
                    page.wait_for_function("document.querySelector('.timeline-photo')?.naturalWidth > 0")
                    check("updated application and photo also reload offline", page.locator('meta[name="tempo-build"]').get_attribute("content") == version_two and page.locator(".timeline-card").count() == 1 and page.locator(".timeline-photo").evaluate("image => image.naturalWidth === 2"))
                    check("no browser JavaScript errors during offline or update lifecycle", not page_errors, page_errors)
                except Exception as error:
                    CHECKS.append({"name": "PWA smoke exception", "passed": False, "observed": repr(error)})
                    print(json.dumps(CHECKS[-1], ensure_ascii=False), flush=True)
                finally:
                    context.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    failed = sum(not result["passed"] for result in CHECKS)
    print(json.dumps({"passed": len(CHECKS) - failed, "failed": failed}, ensure_ascii=False))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
