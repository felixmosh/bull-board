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

export type FlagValues = Partial<Record<keyof typeof FLAG_OPTIONS, string | boolean>>;

export function parseFlags(argv: string[]): FlagValues {
  const { values } = parseArgs({ args: argv, options: FLAG_OPTIONS, allowPositionals: false });

  return values as FlagValues;
}
