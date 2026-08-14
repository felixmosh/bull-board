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

  const board = await run(config);

  if (config.open) {
    // The bound URL, not one rebuilt from config: `--port 0` picks an ephemeral port.
    openBrowser(board.url);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      // oxlint-disable-next-line no-console
      console.log('\nShutting down.');
      board
        .close()
        .then(() => process.exit(0))
        .catch((error: Error) => {
          console.error(error.message);
          process.exit(1);
        });
    });
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
