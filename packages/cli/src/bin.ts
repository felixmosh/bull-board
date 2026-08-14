#!/usr/bin/env node
import { loadConfigFile } from './config/file';
import { parseFlags } from './config/flags';
import { resolveConfig } from './config/resolve';
import { HELP } from './help';
import { run } from './index';
import { openBrowser } from './openBrowser';

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

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

  try {
    new URL(config.redisUrl);
  } catch {
    throw new Error(`Invalid Redis URL: ${config.redisUrl}`);
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
        .catch(() => process.exit(1));
    });
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
