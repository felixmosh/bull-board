import { spawn } from 'node:child_process';

/** Small enough not to justify a dependency. */
export function openBrowser(url: string, browser?: string): void {
  const isWindows = process.platform === 'win32';
  const [command, ...args] = browser
    ? browser.split(/\s+/).filter(Boolean)
    : [process.platform === 'darwin' ? 'open' : isWindows ? 'start' : 'xdg-open'];

  // `spawn` reports a missing binary through an asynchronous 'error' event rather than by
  // throwing, and an 'error' event with no listener is an uncaught exception that kills the
  // process. Headless machines routinely have no opener at all, so without this listener the
  // dashboard would start, print its URL, and then die trying to show it.
  //
  // `shell: true` is only for Windows' built-in `start`, which is a shell command, not a
  // binary on PATH. A custom `--browser`/$BROWSER command runs unshelled everywhere, since
  // shelling out a user-supplied string would turn it into an injection surface.
  spawn(command, [...args, url], { stdio: 'ignore', detached: true, shell: isWindows })
    .on('error', () => {
      // oxlint-disable-next-line no-console
      console.log(`Could not open a browser automatically. Open ${url} yourself.`);
    })
    .unref();
}
