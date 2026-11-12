import type { ClusterOptions, RedisOptions } from 'ioredis';
import type { FlagValues } from './flags';
import { mergeTls, resolveTlsFlags, type TlsFlags } from './tls';
import type { FileConfig } from './types';

export interface Address {
  host: string;
  port: number;
}

export type ConnectionConfig =
  | { mode: 'url'; url: string; options: RedisOptions }
  | { mode: 'sentinel'; options: RedisOptions }
  | {
      mode: 'cluster';
      nodes: Address[];
      options: RedisOptions;
      clusterOptions: Omit<ClusterOptions, 'redisOptions'>;
    }
  | { mode: 'options'; options: RedisOptions };

const DEFAULT_REDIS_URL = 'redis://localhost:6379';
const DEFAULT_SENTINEL_PORT = 26379;
const DEFAULT_REDIS_PORT = 6379;

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined && value !== '');
}

function parseAddress(entry: string, label: string, defaultPort: number): Address {
  if (entry.includes('@')) {
    throw new Error(
      `Invalid ${label} address "${entry}": credentials go in the credential flags, such as --redis-password, not in the address.`
    );
  }

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

function parseClusterNodes(value: string): {
  nodes: Address[];
  scheme: 'redis' | 'rediss' | undefined;
} {
  const schemes = new Set<string>();
  const nodes = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const scheme = /^(rediss?):\/\//i.exec(entry);
      if (!scheme) return parseAddress(entry, 'cluster node', DEFAULT_REDIS_PORT);

      schemes.add(scheme[1].toLowerCase());
      return parseAddress(entry.slice(scheme[0].length), 'cluster node', DEFAULT_REDIS_PORT);
    });

  if (schemes.size > 1) {
    throw new Error(
      '--cluster mixes redis:// and rediss:// nodes. TLS is on or off for the whole cluster.'
    );
  }

  return { nodes, scheme: [...schemes][0] as 'redis' | 'rediss' | undefined };
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

function applySentinelTls(options: RedisOptions, tlsFlags: TlsFlags): RedisOptions {
  const result = { ...options };
  if (tlsFlags.dataNodes) {
    result.tls = mergeTls(options.tls, tlsFlags.dataNodes);
    result.enableTLSForSentinelMode = true;
  }
  if (tlsFlags.sentinels) result.sentinelTLS = mergeTls(options.sentinelTLS, tlsFlags.sentinels);

  return result;
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
  const tlsFlags = resolveTlsFlags({ flags, env });

  const modes = [
    explicitUrl && 'a Redis URL',
    sentinelList && '--sentinel',
    clusterList && '--cluster',
  ].filter(Boolean);
  if (modes.length > 1) {
    throw new Error(`Use only one of ${modes.slice(0, -1).join(', ')} and ${modes.at(-1)}.`);
  }

  const fileRedis = file.redis;
  const fileOptions = typeof fileRedis === 'object' ? fileRedis : undefined;
  const fileCluster = file.cluster;

  if (fileCluster) {
    if (explicitUrl || sentinelList) {
      throw new Error(
        `The config file's cluster key cannot be used with ${explicitUrl ? 'a Redis URL' : '--sentinel'}.`
      );
    }
    if (typeof fileRedis === 'string') {
      throw new Error(
        'The config file sets both a redis URL and a cluster key. Use the redis key for per-node options, as an object.'
      );
    }
  }

  const clusterNodes =
    clusterList ??
    (Array.isArray(fileCluster?.nodes) ? fileCluster.nodes.join(',') : fileCluster?.nodes);
  const sentinelMode = Boolean(sentinelList) || (!clusterNodes && Boolean(fileOptions?.sentinels));
  if (tlsFlags.sentinels && !sentinelMode) {
    throw new Error('--sentinel-tls only applies when connecting through --sentinel.');
  }

  if (fileCluster && !clusterNodes) {
    throw new Error("The config file's cluster key needs cluster.nodes, or pass --cluster.");
  }

  if (clusterNodes) {
    if (credentials.options.db !== undefined) {
      throw new Error('--redis-db cannot be used with --cluster: a cluster only has database 0.');
    }
    if (fileOptions?.sentinels) {
      throw new Error('The config file sets redis.sentinels, which cannot be used with --cluster.');
    }

    const { nodes, scheme } = parseClusterNodes(clusterNodes);
    if (scheme === 'redis' && tlsFlags.dataNodes) {
      throw new Error(
        `${tlsFlags.names.join(', ')} cannot be used with redis:// cluster nodes. Use rediss:// or leave the scheme out.`
      );
    }

    const options: RedisOptions = { ...fileOptions, ...credentials.options };
    const tls = mergeTls(options.tls, tlsFlags.dataNodes) ?? (scheme === 'rediss' ? {} : undefined);
    if (tls) options.tls = tls;

    return { mode: 'cluster', nodes, options, clusterOptions: fileCluster?.options ?? {} };
  }

  if (sentinelList) {
    if (!sentinelName) {
      throw new Error('--sentinel needs --sentinel-name, the Redis master group name.');
    }

    return {
      mode: 'sentinel',
      options: applySentinelTls(
        {
          ...fileOptions,
          sentinels: parseAddresses(sentinelList, 'sentinel', DEFAULT_SENTINEL_PORT),
          name: sentinelName,
          ...credentials.options,
        },
        tlsFlags
      ),
    };
  }

  if (!explicitUrl && fileOptions) {
    const options = { ...fileOptions, ...credentials.options };
    if (fileOptions.sentinels)
      return { mode: 'sentinel', options: applySentinelTls(options, tlsFlags) };

    const tls = mergeTls(options.tls, tlsFlags.dataNodes);

    return { mode: 'options', options: tls ? { ...options, tls } : options };
  }

  const url =
    explicitUrl ?? (typeof fileRedis === 'string' ? fileRedis : undefined) ?? DEFAULT_REDIS_URL;
  assertUsableUrl(url);

  if (credentials.names.length > 0) {
    throw new Error(
      `${credentials.names.join(', ')} cannot be combined with a Redis URL. Put credentials in the URL itself, or connect through --sentinel or --cluster.`
    );
  }

  if (tlsFlags.dataNodes && !/^rediss:\/\//i.test(url)) {
    throw new Error(
      `TLS settings (${tlsFlags.names.join(', ')}) need a rediss:// URL: a Redis URL turns TLS on through its scheme.`
    );
  }

  return { mode: 'url', url, options: tlsFlags.dataNodes ? { tls: tlsFlags.dataNodes } : {} };
}
