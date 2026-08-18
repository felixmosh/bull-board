import { spawn } from 'node:child_process';

function onSpawnError(url: string): (error: Error) => void {
  return () => {
    // oxlint-disable-next-line no-console
    console.log(`Could not open a browser automatically. Open ${url} yourself.`);
  };
}

// Kept separate from openUnshelled so the only shelled call is the fixed 'start', never a
// user-supplied command.
function openWindowsDefault(url: string): void {
  spawn('start', [url], {
    stdio: 'ignore',
    detached: true,
    shell: true,
  })
    .on('error', onSpawnError(url))
    .unref();
}

function openUnshelled(command: string, args: string[], url: string): void {
  spawn(command, [...args, url], {
    stdio: 'ignore',
    detached: true,
    shell: false,
  })
    .on('error', onSpawnError(url))
    .unref();
}

export function openBrowser(url: string, browser?: string): void {
  const isWindows = process.platform === 'win32';
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
