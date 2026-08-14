import { spawn } from 'node:child_process';

/** Small enough not to justify a dependency. Failure is silent by design. */
export function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';

  try {
    spawn(command, [url], {
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    }).unref();
  } catch {
    // The URL is printed regardless, so there is nothing to recover from.
  }
}
