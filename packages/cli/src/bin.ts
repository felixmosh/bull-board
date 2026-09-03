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
    explicitPath: flags.config || process.env.BULL_BOARD_CONFIG,
  });
  const config = resolveConfig({ flags, env: process.env, file });

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
    openBrowser(board.url, config.browser);
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
