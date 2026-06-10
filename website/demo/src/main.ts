import { worker } from './mocks/worker';

async function main() {
  document.getElementById('__UI_CONFIG__')!.textContent = document
    .getElementById('__UI_CONFIG__')!
    .textContent?.replace(/&quot;/g, '"');
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: '/bull-board/demo/mockServiceWorker.js' },
    quiet: true,
  });
}

main().catch((err) => {
  console.error('[demo] boot failed', err);
});
