/** Optional install/offline shell. Journal data stay exclusively in IndexedDB. */
let deferredPrompt;
let waitingWorker;
let updateAccepted = false;
let report = () => {};

function updateConnectionStatus() {
  const target = document.querySelector('#pwa-status');
  if (!target) return;
  target.innerHTML = navigator.onLine ? '' : '<div class="demo-banner connection-banner"><span>Jsi bez připojení. Deník i uložené fotky můžeš používat dál v tomto prohlížeči.</span></div>';
}

function showUpdate(worker) {
  waitingWorker = worker;
  const target = document.querySelector('#pwa-update');
  if (target) target.innerHTML = '<div class="demo-banner update-banner"><span><strong>Nová verze je připravená.</strong> Tvoje uložené záznamy zůstanou zachované.</span><button class="button secondary small" data-action="update-app">Aktualizovat</button></div>';
}

function hasUnsavedForm() {
  if (document.querySelector('dialog[open]')) return true;
  const fields = document.querySelectorAll('#settings-form input');
  return [...fields].some(field => field.value !== field.defaultValue);
}

export function acceptUpdate() {
  if (!waitingWorker) return;
  if (hasUnsavedForm()) {
    report('Nejdřív ulož nebo zavři rozepsaný formulář. Pak můžeš aktualizovat aplikaci.');
    return;
  }
  updateAccepted = true;
  waitingWorker.postMessage({type:'SKIP_WAITING'});
}

export async function requestInstall() {
  if (!deferredPrompt) return;
  const prompt = deferredPrompt;
  deferredPrompt = undefined;
  document.querySelector('#install-app')?.classList.add('hidden');
  await prompt.prompt();
  await prompt.userChoice;
}

export async function initializePWA({notify} = {}) {
  report = notify || (() => {});
  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  updateConnectionStatus();

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    document.querySelector('#install-app')?.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = undefined;
    document.querySelector('#install-app')?.classList.add('hidden');
  });

  // Source development stays uncached. The production build stamps this value.
  const version = document.querySelector('meta[name="tempo-build"]')?.content;
  if (!version || version === '__TEMPO_VERSION__' || !window.isSecureContext || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateAccepted) location.reload();
  });
  try {
    const registration = await navigator.serviceWorker.register('./service-worker.js', {scope:'./',updateViaCache:'none'});
    if (registration.waiting) showUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
      });
    });
  } catch {
    report('Deník funguje. Režim bez připojení se zatím nepodařilo připravit; zkus později obnovit stránku.');
  }
}
