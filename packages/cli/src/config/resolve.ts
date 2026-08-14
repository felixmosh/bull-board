import type { QueueAdapterOptions } from '@bull-board/api/typings/app';
import type { FlagValues } from './flags';
import type { CliConfig, FileConfig } from './types';

const DEFAULTS = {
  redisUrl: 'redis://localhost:6379',
  port: 3000,
  host: '127.0.0.1',
  prefixes: ['bull'],
  scanInterval: 10,
};

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined && value !== '');
}

function toList(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const parts = (Array.isArray(value) ? value : value.split(','))
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : undefined;
}

function toNumber(value: string | number | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return parsed;
}

function toBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;

  return !['0', 'false', 'no', ''].includes(value.toLowerCase());
}

function normalizeBasePath(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.replace(/^\/+|\/+$/g, '');

  return trimmed === '' ? '' : `/${trimmed}`;
}

export function resolveConfig({
  flags,
  env,
  file,
}: {
  flags: FlagValues;
  env: NodeJS.ProcessEnv;
  file: FileConfig;
}): CliConfig {
  const explicitQueues = Array.isArray(file.queues) ? file.queues : undefined;
  const queueOptions = (file.queues && !Array.isArray(file.queues) ? file.queues : {}) as Record<
    string,
    Partial<QueueAdapterOptions>
  >;

  const user = firstDefined(flags.user, env.BULL_BOARD_USER, file.user);
  const password = firstDefined(flags.password, env.BULL_BOARD_PASSWORD, file.password);
  if (Boolean(user) !== Boolean(password)) {
    throw new Error('Basic auth needs both --user and --password (or neither).');
  }

  const uiConfig = { ...file.uiConfig };
  const boardTitle = firstDefined(flags['board-title'], env.BULL_BOARD_BOARD_TITLE);
  if (boardTitle) {
    uiConfig.boardTitle = boardTitle;
  }

  return {
    redisUrl: firstDefined(flags.redis, env.BULL_BOARD_REDIS_URL, file.redis) ?? DEFAULTS.redisUrl,
    port:
      toNumber(flags.port, 'port') ??
      toNumber(env.BULL_BOARD_PORT, 'port') ??
      toNumber(file.port, 'port') ??
      DEFAULTS.port,
    host: firstDefined(flags.host, env.BULL_BOARD_HOST, file.host) ?? DEFAULTS.host,
    prefixes:
      toList(flags.prefix) ??
      toList(env.BULL_BOARD_PREFIX) ??
      toList(file.prefix) ??
      DEFAULTS.prefixes,
    queueNames:
      toList(flags.queues) ?? toList(env.BULL_BOARD_QUEUES) ?? toList(explicitQueues) ?? null,
    scanInterval:
      toNumber(flags['scan-interval'], 'scan-interval') ??
      toNumber(env.BULL_BOARD_SCAN_INTERVAL, 'scan-interval') ??
      toNumber(file.scanInterval, 'scan-interval') ??
      DEFAULTS.scanInterval,
    basePath:
      normalizeBasePath(flags['base-path']) ??
      normalizeBasePath(env.BULL_BOARD_BASE_PATH) ??
      normalizeBasePath(file.basePath) ??
      '',
    readOnly: flags['read-only'] ?? toBoolean(env.BULL_BOARD_READ_ONLY) ?? file.readOnly ?? false,
    auth: user && password ? { user, password } : null,
    open: flags['no-open'] === true ? false : (toBoolean(env.BULL_BOARD_OPEN) ?? file.open ?? true),
    browser: firstDefined(flags.browser, env.BULL_BOARD_BROWSER, env.BROWSER, file.browser),
    uiConfig,
    queueOptions,
  };
}
