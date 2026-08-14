import { RETRY_INTERVAL_MS, type ConnectionState } from './connectionState';

/** Not under `basePath`: it has to be reachable and stable regardless of where the board
 * itself is mounted, and it must never collide with a real board route. */
export const STATUS_PATH = '/__bull-board-cli/status';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderDiagnosticPage(state: ConnectionState): string {
  const error = state.status === 'unavailable' ? state.lastError : 'Connecting for the first time.';
  const retrySeconds = RETRY_INTERVAL_MS / 1000;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="5" />
<title>bull-board - waiting for Redis</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f6f7;
    --panel: #ffffff;
    --text: #1b1b1d;
    --muted: #63646a;
    --border: #dcdde0;
    --accent: #b3261e;
    --code-bg: #eef0f2;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16171a;
      --panel: #202126;
      --text: #e8e9eb;
      --muted: #9a9ba3;
      --border: #34353b;
      --accent: #ff8a80;
      --code-bg: #2a2c33;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2.5rem 1.25rem;
    background: var(--bg);
    color: var(--text);
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 2rem;
  }
  h1 { margin-top: 0; font-size: 1.35rem; }
  .status { color: var(--accent); font-weight: 600; margin-top: -0.25rem; }
  code {
    background: var(--code-bg);
    border-radius: 4px;
    padding: 0.15rem 0.4rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    word-break: break-all;
  }
  ul { padding-left: 1.25rem; }
  li { margin: 0.35rem 0; }
  .muted { color: var(--muted); font-size: 0.9em; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1rem; margin: 1.25rem 0; }
  dt { color: var(--muted); }
  dd { margin: 0; }
</style>
</head>
<body>
<main>
  <h1>bull-board is waiting for Redis</h1>
  <p class="status">Not connected yet (attempt ${state.attempts}).</p>
  <dl>
    <dt>Redis URL</dt><dd><code>${escapeHtml(state.redisUrl)}</code></dd>
    <dt>Error</dt><dd><code>${escapeHtml(error)}</code></dd>
    <dt>Attempts</dt><dd>${state.attempts}</dd>
  </dl>
  <p>This page checks in on its own and will switch to the dashboard the moment Redis answers. Nothing to do here but wait, or go fix Redis.</p>
  <p>Likely causes:</p>
  <ul>
    <li>Redis is not running.</li>
    <li>The port is wrong. The default is 6379.</li>
    <li>Redis is in a container whose port is not published to the host.</li>
    <li>Redis needs credentials that are missing from the URL.</li>
    <li>Redis needs TLS, which means the URL should start with <code>rediss://</code> instead of <code>redis://</code>.</li>
  </ul>
  <p class="muted">Retrying every ${retrySeconds}s. Pass <code>--no-retry</code> to exit immediately instead of waiting.</p>
</main>
<script>
  (function poll() {
    fetch(${JSON.stringify(STATUS_PATH)}, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (nextState) {
        if (nextState.status === 'connected') {
          location.reload();
          return;
        }
        setTimeout(poll, 2000);
      })
      .catch(function () {
        setTimeout(poll, 2000);
      });
  })();
</script>
</body>
</html>
`;
}
