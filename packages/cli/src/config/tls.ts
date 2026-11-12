import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import type { FlagValues } from './flags';

export interface TlsFlags {
  dataNodes: ConnectionOptions | undefined;
  sentinels: ConnectionOptions | undefined;
  names: string[];
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined && value !== '');
}

function toBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;

  return !['0', 'false', 'no', ''].includes(value.toLowerCase());
}

function readPem(value: string, flag: string): string {
  if (value.trimStart().startsWith('-----BEGIN')) {
    return value.includes('\n') ? value : value.replace(/\\n/g, '\n');
  }

  try {
    return readFileSync(value, 'utf8');
  } catch (error) {
    throw new Error(`Could not read ${flag} file ${value}: ${(error as Error).message}`);
  }
}

export function resolveTlsFlags({
  flags,
  env,
}: {
  flags: FlagValues;
  env: NodeJS.ProcessEnv;
}): TlsFlags {
  const enabled = flags.tls ?? toBoolean(env.BULL_BOARD_REDIS_TLS);
  const ca = firstDefined(flags['tls-ca'], env.BULL_BOARD_REDIS_TLS_CA);
  const cert = firstDefined(flags['tls-cert'], env.BULL_BOARD_REDIS_TLS_CERT);
  const key = firstDefined(flags['tls-key'], env.BULL_BOARD_REDIS_TLS_KEY);
  const servername = firstDefined(flags['tls-servername'], env.BULL_BOARD_REDIS_TLS_SERVERNAME);
  const insecure = flags['tls-insecure'] ?? toBoolean(env.BULL_BOARD_REDIS_TLS_INSECURE);
  const sentinelTls = flags['sentinel-tls'] ?? toBoolean(env.BULL_BOARD_SENTINEL_TLS);

  if (Boolean(cert) !== Boolean(key)) {
    throw new Error('--tls-cert and --tls-key go together: pass both, or neither.');
  }

  const shared: ConnectionOptions = {};
  if (ca) shared.ca = readPem(ca, '--tls-ca');
  if (cert && key) {
    shared.cert = readPem(cert, '--tls-cert');
    shared.key = readPem(key, '--tls-key');
  }
  if (insecure) shared.rejectUnauthorized = false;

  const names = [
    enabled && '--tls',
    ca && '--tls-ca',
    cert && '--tls-cert',
    key && '--tls-key',
    servername && '--tls-servername',
    insecure && '--tls-insecure',
  ].filter((name): name is string => Boolean(name));

  return {
    dataNodes: names.length > 0 ? { ...shared, ...(servername ? { servername } : {}) } : undefined,
    sentinels: sentinelTls ? shared : undefined,
    names: sentinelTls ? [...names, '--sentinel-tls'] : names,
  };
}

export function mergeTls(
  fileTls: ConnectionOptions | undefined,
  flagTls: ConnectionOptions | undefined
): ConnectionOptions | undefined {
  if (!flagTls) return fileTls;

  return { ...fileTls, ...flagTls };
}
