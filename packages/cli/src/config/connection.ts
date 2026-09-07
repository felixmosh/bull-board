import type { RedisOptions } from 'ioredis';
import type { FlagValues } from './flags';
import type { FileConfig } from './types';

export interface Address {
  host: string;
  port: number;
}

export type ConnectionConfig =
  | { mode: 'url'; url: string; options: RedisOptions }
  | { mode: 'sentinel'; options: RedisOptions }
  | { mode: 'cluster'; nodes: Address[]; options: RedisOptions }
  | { mode: 'options'; options: RedisOptions };

const DEFAULT_REDIS_URL = 'redis://localhost:6379';
const DEFAULT_SENTINEL_PORT = 26379;
const DEFAULT_REDIS_PORT = 6379;

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined && value !== '');
}

function parseAddress(entry: string, label: string, defaultPort: number): Address {
  // A bare IPv6 literal is all colons, so bracket it before the URL parser sees a port.
  const bracketed =
    !entry.startsWith('[') && entry.indexOf(':') !== entry.lastIndexOf(':') ? `[${entry}]` : entry;

  let parsed: URL;
  try {
    parsed = new URL(`redis://${bracketed}`);
  } catch {
    throw new Error(`Invalid ${label} address "${entry}": expected host or host:port.`);
  }

  const port = parsed.port === '' ? defaultPort : Number(parsed.port);
  if (!parsed.hostname || parsed.pathname || parsed.search || port === 0) {
    throw new Error(`Invalid ${label} address "${entry}": expected host or host:port.`);
  }

  return { host: unbracket(parsed.hostname), port };
}

function unbracket(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function parseAddresses(value: string, label: string, defaultPort: number): Address[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => parseAddress(entry, label, defaultPort));
}

function assertUsableUrl(url: string): void {
  if (url.startsWith('/')) return;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid Redis URL: ${url}`);
  }
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
    throw new Error(`Redis URL must use redis:// or rediss://, got "${parsed.protocol}//"`);
  }
}

function credentialOptions({ flags, env }: { flags: FlagValues; env: NodeJS.ProcessEnv }): {
  options: RedisOptions;
  names: string[];
} {
  const options: RedisOptions = {};
  const names: string[] = [];

  const add = <K extends keyof RedisOptions>(
    name: string,
    key: K,
    value: RedisOptions[K] | undefined
  ) => {
    if (value === undefined) return;
    options[key] = value;
    names.push(name);
  };

  const db = firstDefined(flags['redis-db'], env.BULL_BOARD_REDIS_DB);
  if (db !== undefined && (!Number.isInteger(Number(db)) || Number(db) < 0)) {
    throw new Error(`Invalid --redis-db: ${db}`);
  }

  add(
    '--sentinel-password',
    'sentinelPassword',
    firstDefined(flags['sentinel-password'], env.BULL_BOARD_SENTINEL_PASSWORD)
  );
  add(
    '--redis-username',
    'username',
    firstDefined(flags['redis-username'], env.BULL_BOARD_REDIS_USERNAME)
  );
  add(
    '--redis-password',
    'password',
    firstDefined(flags['redis-password'], env.BULL_BOARD_REDIS_PASSWORD)
  );
  add('--redis-db', 'db', db === undefined ? undefined : Number(db));

  return { options, names };
}

export function resolveConnection({
  flags,
  env,
  file,
}: {
  flags: FlagValues;
  env: NodeJS.ProcessEnv;
  file: FileConfig;
}): ConnectionConfig {
  const explicitUrl = firstDefined(flags.redis, env.BULL_BOARD_REDIS_URL);
  const sentinelList = firstDefined(flags.sentinel, env.BULL_BOARD_SENTINELS);
  const sentinelName = firstDefined(flags['sentinel-name'], env.BULL_BOARD_SENTINEL_NAME);
  const clusterList = firstDefined(flags.cluster, env.BULL_BOARD_CLUSTER_NODES);
  const credentials = credentialOptions({ flags, env });

  const modes = [
    explicitUrl && 'a Redis URL',
    sentinelList && '--sentinel',
    clusterList && '--cluster',
  ].filter(Boolean);
  if (modes.length > 1) {
    throw new Error(`Use only one of ${modes.slice(0, -1).join(', ')} and ${modes.at(-1)}.`);
  }

  if (clusterList) {
    if (credentials.options.db !== undefined) {
      throw new Error('--redis-db cannot be used with --cluster: a cluster only has database 0.');
    }

    return {
      mode: 'cluster',
      nodes: parseAddresses(clusterList, 'cluster node', DEFAULT_REDIS_PORT),
      options: credentials.options,
    };
  }

  if (sentinelList) {
    if (!sentinelName) {
      throw new Error('--sentinel needs --sentinel-name, the Redis master group name.');
    }

    return {
      mode: 'sentinel',
      options: {
        sentinels: parseAddresses(sentinelList, 'sentinel', DEFAULT_SENTINEL_PORT),
        name: sentinelName,
        ...credentials.options,
      },
    };
  }

  const fileRedis = file.redis;
  if (!explicitUrl && typeof fileRedis === 'object') {
    const options = { ...fileRedis, ...credentials.options };

    return fileRedis.sentinels ? { mode: 'sentinel', options } : { mode: 'options', options };
  }

  const url =
    explicitUrl ?? (typeof fileRedis === 'string' ? fileRedis : undefined) ?? DEFAULT_REDIS_URL;
  assertUsableUrl(url);

  if (credentials.names.length > 0) {
    throw new Error(
      `${credentials.names.join(', ')} cannot be combined with a Redis URL. Put credentials in the URL itself, or connect through --sentinel or --cluster.`
    );
  }

  return { mode: 'url', url, options: {} };
}
