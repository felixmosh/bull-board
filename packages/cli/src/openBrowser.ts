import { spawn } from 'node:child_process';

/** Small enough not to justify a dependency. */
export function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';

  // `spawn` reports a missing binary through an asynchronous 'error' event rather than by
  // throwing, and an 'error' event with no listener is an uncaught exception that kills the
  // process. Headless machines routinely have no opener at all, so without this listener the
  // dashboard would start, print its URL, and then die trying to show it.
  spawn(command, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' })
    .on('error', () => {
      // oxlint-disable-next-line no-console
      console.log(`Could not open a browser automatically. Open ${url} yourself.`);
    })
    .unref();
}
