import { spawn } from 'node:child_process';

// `spawn` reports a missing binary through an asynchronous 'error' event rather than by
// throwing, and an 'error' event with no listener is an uncaught exception that kills the
// process. Headless machines routinely have no opener at all, so without this listener the
// dashboard would start, print its URL, and then die trying to show it. The same listener
// covers a custom Windows command that isn't on PATH: `spawn` still reports that via 'error'
// whether or not a shell is involved.
function onSpawnError(url: string): (error: Error) => void {
  return () => {
    // oxlint-disable-next-line no-console
    console.log(`Could not open a browser automatically. Open ${url} yourself.`);
  };
}

/** Windows' built-in `open` is `start`, a shell built-in rather than a binary on PATH, so it
 * needs `shell: true` to run at all. `command` is the literal `'start'` here, never anything
 * derived from `$BROWSER`/`--browser`, so this call site can only ever shell out a fixed
 * string -- there is no path through it where a tainted value reaches `spawn` with a shell.
 * That is a static property of this function, not just this call, which is the point: keeping
 * it split from the unshelled call below (rather than a shared `shell` flag computed from both
 * branches) is what makes a static analyzer able to see it too, instead of having to prove it
 * path-sensitively. */
function openWindowsDefault(url: string): void {
  spawn('start', [url], {
    stdio: 'ignore',
    detached: true,
    shell: true,
  })
    .on('error', onSpawnError(url))
    .unref();
}

/** Every other case: the platform default opener (`open` on macOS, `xdg-open` elsewhere, or
 * Windows' own default when no `--browser`/$BROWSER applies and the platform isn't Windows),
 * or a user-supplied `--browser`/$BROWSER command, including on Windows. Never shelled: a
 * custom command is a user-supplied string, and shelling it out would turn it into an
 * injection surface. `command`/`args` are the only variable inputs to `spawn` here, and
 * `shell` is always `false` -- structurally, not just today, so nothing tainted can ever reach
 * a shell through this call site. */
function openUnshelled(command: string, args: string[], url: string): void {
  spawn(command, [...args, url], {
    stdio: 'ignore',
    detached: true,
    shell: false,
  })
    .on('error', onSpawnError(url))
    .unref();
}

/** Small enough not to justify a dependency. */
export function openBrowser(url: string, browser?: string): void {
  const isWindows = process.platform === 'win32';
  // A whitespace-only `--browser`/$BROWSER value (e.g. an unset shell variable expanding to
  // `"   "`) filters down to an empty array here, not a one-element array with an empty
  // command -- `usingDefault` below then correctly falls back to the platform opener instead
  // of handing `spawn` an `undefined` command, which throws synchronously (outside the
  // `'error'` listener above, so nothing would catch it).
  const custom = browser?.split(/\s+/).filter(Boolean) ?? [];

  if (custom.length === 0) {
    if (isWindows) {
      openWindowsDefault(url);
      return;
    }
    openUnshelled(process.platform === 'darwin' ? 'open' : 'xdg-open', [], url);
    return;
  }

  const [command, ...args] = custom;
  openUnshelled(command, args, url);
}
