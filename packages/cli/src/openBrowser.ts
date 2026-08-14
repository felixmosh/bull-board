import { spawn } from 'node:child_process';

/** Small enough not to justify a dependency. */
export function openBrowser(url: string, browser?: string): void {
  const isWindows = process.platform === 'win32';
  // A whitespace-only `--browser`/$BROWSER value (e.g. an unset shell variable expanding to
  // `"   "`) filters down to an empty array here, not a one-element array with an empty
  // command -- `usingDefault` below then correctly falls back to the platform opener instead
  // of handing `spawn` an `undefined` command, which throws synchronously (outside the
  // `'error'` listener below, so nothing would catch it).
  const custom = browser?.split(/\s+/).filter(Boolean) ?? [];
  const usingDefault = custom.length === 0;
  const [command, ...args] = usingDefault
    ? [process.platform === 'darwin' ? 'open' : isWindows ? 'start' : 'xdg-open']
    : custom;

  // `spawn` reports a missing binary through an asynchronous 'error' event rather than by
  // throwing, and an 'error' event with no listener is an uncaught exception that kills the
  // process. Headless machines routinely have no opener at all, so without this listener the
  // dashboard would start, print its URL, and then die trying to show it. The same listener
  // covers a custom Windows command that isn't on PATH: `spawn` still reports that via
  // 'error' whether or not a shell is involved.
  //
  // `shell: true` is only for Windows' built-in `start`, which is a shell command, not a
  // binary on PATH -- so it is used only when `usingDefault` is also true. A custom
  // `--browser`/$BROWSER command always runs unshelled, on every platform including
  // Windows, since shelling out a user-supplied string would turn it into an injection
  // surface.
  spawn(command, [...args, url], {
    stdio: 'ignore',
    detached: true,
    shell: isWindows && usingDefault,
  })
    .on('error', () => {
      // oxlint-disable-next-line no-console
      console.log(`Could not open a browser automatically. Open ${url} yourself.`);
    })
    .unref();
}
