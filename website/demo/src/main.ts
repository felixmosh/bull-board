import { worker } from './mocks/worker';

async function main() {
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: '/bull-board/demo/mockServiceWorker.js' },
    quiet: true,
  });

  const scriptsEl = document.getElementById('__UI_SCRIPTS__');
  if (!scriptsEl) {
    throw new Error('__UI_SCRIPTS__ element missing from index.html');
  }
  const scripts: unknown = JSON.parse(scriptsEl.textContent || '[]');

  if (!Array.isArray(scripts) || scripts.length === 0) {
    throw new Error('No UI entry scripts were emitted by prepare-ui.mjs');
  }

  const SAFE_SCRIPT_SRC = /^static\/js\/[A-Za-z0-9._\-/]+\.js$/;

  for (const src of scripts) {
    if (typeof src !== 'string' || !SAFE_SCRIPT_SRC.test(src)) {
      throw new Error(`Refusing to load script with unexpected src: ${String(src)}`);
    }
    const s = document.createElement('script');
    s.src = src;
    s.defer = true;
    document.body.appendChild(s);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[demo] boot failed', err);
});
