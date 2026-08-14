import { parseArgs } from 'node:util';

export const FLAG_OPTIONS = {
  redis: { type: 'string', short: 'r' },
  port: { type: 'string', short: 'p' },
  host: { type: 'string' },
  prefix: { type: 'string' },
  queues: { type: 'string' },
  'scan-interval': { type: 'string' },
  'base-path': { type: 'string' },
  'read-only': { type: 'boolean' },
  user: { type: 'string' },
  password: { type: 'string' },
  'board-title': { type: 'string' },
  config: { type: 'string' },
  'no-open': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

export function parseFlags(argv: string[]) {
  const { values } = parseArgs({ args: argv, options: FLAG_OPTIONS, allowPositionals: false });

  return values;
}

export type FlagValues = ReturnType<typeof parseFlags>;
