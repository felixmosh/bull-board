#!/usr/bin/env node
import { loadConfigFile } from './config/file';
import { parseFlags } from './config/flags';
import { resolveConfig } from './config/resolve';
import { HELP } from './help';
import { run } from './index';
import { openBrowser } from './openBrowser';

async function main(): Promise<void> {
  let flags: ReturnType<typeof parseFlags>;
  try {
    flags = parseFlags(process.argv.slice(2));
  } catch (error) {
    throw new Error(`${(error as Error).message}\nRun bull-board --help for usage.`);
  }

  if (flags.help) {
    // oxlint-disable-next-line no-console
    console.log(HELP);
    return;
  }

  if (flags.version) {
    // oxlint-disable-next-line no-console
    console.log(require('../package.json').version);
    return;
  }

  const file = await loadConfigFile({
    cwd: process.cwd(),
    explicitPath: (flags.config as string) || process.env.BULL_BOARD_CONFIG,
  });
  const config = resolveConfig({ flags, env: process.env, file });

  // A leading "/" is a unix socket path, which ioredis accepts directly and `new URL()`
  // rejects. Anything else has to parse as a URL, and specifically as redis:// or
  // rediss://, since `new URL()` alone happily accepts `http://...` and ioredis would then
  // silently dial `{ host: "http", port: 6379 }`.
  if (!config.redisUrl.startsWith('/')) {
    let parsed: URL;
    try {
      parsed = new URL(config.redisUrl);
    } catch {
      throw new Error(`Invalid Redis URL: ${config.redisUrl}`);
    }
    if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
      throw new Error(`Redis URL must use redis:// or rediss://, got "${parsed.protocol}//"`);
    }
  }

  // `beforeReady` arms signal handling before `run` prints anything or schedules a rescan,
  // so a SIGINT/SIGTERM arriving the instant the "listening" banner is visible always has a
  // handler to catch it. Registering only after `run` returns left a real gap: printing the
  // banner, then opening a browser (a real OS process spawn, slow relative to the rest of
  // this setup), all happened before a listener existed, so a signal in that window fell
  // through to Node's default disposition and killed the process outright instead of running
  // `board.close()`.
  const board = await run(config, console, {
    beforeReady: (close) => {
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
          // oxlint-disable-next-line no-console
          console.log('\nShutting down.');
          close()
            .then(() => process.exit(0))
            .catch((error: Error) => {
              console.error(error.message);
              process.exit(1);
            });
        });
      }
    },
  });

  if (config.open) {
    // The bound URL, not one rebuilt from config: `--port 0` picks an ephemeral port.
    openBrowser(board.url);
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
