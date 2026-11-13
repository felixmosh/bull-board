import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConnection } from '../src/config/connection';
import { parseFlags } from '../src/config/flags';

const noEnv = {} as NodeJS.ProcessEnv;
const noFile = {};

const resolve = (
  argv: string[],
  env: NodeJS.ProcessEnv = noEnv,
  file: Parameters<typeof resolveConnection>[0]['file'] = noFile
) => resolveConnection({ flags: parseFlags(argv), env, file });

describe('resolveConnection', () => {
  it('defaults to the localhost URL', () => {
    expect(resolve([])).toEqual({
      mode: 'url',
      url: 'redis://localhost:6379',
      options: {},
    });
  });

  it('keeps a URL untouched, so URL mode behaves exactly as it did', () => {
    expect(resolve(['--redis', 'rediss://user:pass@example.com:6380/3?family=6'])).toEqual({
      mode: 'url',
      url: 'rediss://user:pass@example.com:6380/3?family=6',
      options: {},
    });
  });

  it('accepts a unix socket path', () => {
    expect(resolve(['--redis', '/tmp/redis.sock'])).toEqual({
      mode: 'url',
      url: '/tmp/redis.sock',
      options: {},
    });
  });

  it('rejects a URL that is not redis:// or rediss://', () => {
    expect(() => resolve(['--redis', 'http://localhost:6379'])).toThrow(
      'Redis URL must use redis:// or rediss://, got "http://"'
    );
  });

  it('rejects a URL that does not parse', () => {
    expect(() => resolve(['--redis', 'not a url'])).toThrow('Invalid Redis URL: not a url');
  });

  it('builds sentinel options from a host list, defaulting the port to 26379', () => {
    expect(
      resolve(['--sentinel', 'a.example:26380, b.example', '--sentinel-name', 'mymaster'])
    ).toEqual({
      mode: 'sentinel',
      options: {
        sentinels: [
          { host: 'a.example', port: 26380 },
          { host: 'b.example', port: 26379 },
        ],
        name: 'mymaster',
      },
    });
  });

  it('reads sentinels from the environment', () => {
    const connection = resolve([], {
      BULL_BOARD_SENTINELS: 'a.example',
      BULL_BOARD_SENTINEL_NAME: 'mymaster',
    } as NodeJS.ProcessEnv);

    expect(connection).toMatchObject({ mode: 'sentinel' });
  });

  it('passes sentinel and data node credentials through', () => {
    const connection = resolve([
      '--sentinel',
      'a.example',
      '--sentinel-name',
      'mymaster',
      '--sentinel-password',
      'watcher',
      '--redis-username',
      'board',
      '--redis-password',
      'hunter2',
      '--redis-db',
      '3',
    ]);

    expect(connection.options).toMatchObject({
      sentinelPassword: 'watcher',
      username: 'board',
      password: 'hunter2',
      db: 3,
    });
  });

  it('rejects sentinels without a master group name', () => {
    expect(() => resolve(['--sentinel', 'a.example'])).toThrow('--sentinel needs --sentinel-name');
  });

  it('rejects an unparseable sentinel entry', () => {
    expect(() => resolve(['--sentinel', 'a.example:nope', '--sentinel-name', 'mymaster'])).toThrow(
      'Invalid sentinel address "a.example:nope"'
    );
  });

  it.each(['a.example:0', 'a.example:99999', 'a.example/path', ':26379'])(
    'rejects the unusable sentinel address %p',
    (entry) => {
      expect(() => resolve(['--sentinel', entry, '--sentinel-name', 'mymaster'])).toThrow(
        `Invalid sentinel address "${entry}"`
      );
    }
  );

  it('builds cluster nodes from a host list, defaulting the port to 6379', () => {
    expect(resolve(['--cluster', 'a.example:7001, b.example'])).toEqual({
      mode: 'cluster',
      nodes: [
        { host: 'a.example', port: 7001 },
        { host: 'b.example', port: 6379 },
      ],
      options: {},
      clusterOptions: {},
    });
  });

  it('reads cluster nodes from the environment', () => {
    const connection = resolve([], {
      BULL_BOARD_CLUSTER_NODES: 'a.example:7001,b.example:7002',
    } as NodeJS.ProcessEnv);

    expect(connection).toMatchObject({ mode: 'cluster' });
  });

  it('passes data node credentials through to the cluster', () => {
    expect(
      resolve([
        '--cluster',
        'a.example:7001',
        '--redis-username',
        'reader',
        '--redis-password',
        'secret',
      ])
    ).toMatchObject({
      mode: 'cluster',
      options: { username: 'reader', password: 'secret' },
    });
  });

  it('brackets an IPv6 cluster node the same way a sentinel one is', () => {
    expect(resolve(['--cluster', '::1'])).toMatchObject({
      nodes: [{ host: '::1', port: 6379 }],
    });
  });

  it('rejects an unparseable cluster node', () => {
    expect(() => resolve(['--cluster', 'a.example:nope'])).toThrow(
      'Invalid cluster node address "a.example:nope"'
    );
  });

  it('turns on TLS for the whole cluster when nodes use rediss://', () => {
    expect(resolve(['--cluster', 'rediss://a.example:7001,b.example'])).toEqual({
      mode: 'cluster',
      nodes: [
        { host: 'a.example', port: 7001 },
        { host: 'b.example', port: 6379 },
      ],
      options: { tls: {} },
      clusterOptions: {},
    });
    expect(resolve(['--cluster', 'redis://a.example:7001']).options.tls).toBeUndefined();
  });

  it('rejects a cluster node list mixing redis:// and rediss://', () => {
    expect(() => resolve(['--cluster', 'rediss://a.example,redis://b.example'])).toThrow(
      '--cluster mixes redis:// and rediss:// nodes'
    );
  });

  it('rejects credentials inside a node address rather than dropping them', () => {
    expect(() => resolve(['--cluster', 'rediss://:secret@a.example:7001'])).toThrow(
      'credentials go in the credential flags'
    );
  });

  it('applies a config file options object to every cluster node, under the flags', () => {
    const connection = resolve(
      ['--cluster', 'rediss://a.example', '--redis-password', 'hunter2'],
      noEnv,
      { redis: { tls: { servername: 'a.example' }, password: 'stale' } }
    );

    expect(connection.options).toEqual({ tls: { servername: 'a.example' }, password: 'hunter2' });
  });

  it('rejects a config file carrying sentinels alongside --cluster', () => {
    expect(() =>
      resolve(['--cluster', 'a.example'], noEnv, {
        redis: { sentinels: [{ host: 's.example', port: 26379 }], name: 'mymaster' },
      })
    ).toThrow('redis.sentinels, which cannot be used with --cluster');
  });

  it('rejects a database selection, which a cluster does not have', () => {
    expect(() => resolve(['--cluster', 'a.example', '--redis-db', '3'])).toThrow(
      '--redis-db cannot be used with --cluster'
    );
  });

  it('rejects a cluster alongside sentinels', () => {
    expect(() =>
      resolve(['--cluster', 'a.example', '--sentinel', 'b.example', '--sentinel-name', 'm'])
    ).toThrow('Use only one of --sentinel and --cluster.');
  });

  it('rejects an explicit Redis URL alongside sentinels', () => {
    expect(() =>
      resolve([
        '--redis',
        'redis://localhost:6379',
        '--sentinel',
        'a.example',
        '--sentinel-name',
        'm',
      ])
    ).toThrow('Use only one of a Redis URL and --sentinel.');
  });

  it('rejects credential flags alongside a Redis URL, which would silently ignore them', () => {
    expect(() =>
      resolve(['--redis', 'redis://localhost:6379', '--redis-password', 'hunter2'])
    ).toThrow('--redis-password cannot be combined with a Redis URL');
  });

  it('takes a full ioredis options object from the config file', () => {
    const connection = resolve([], noEnv, {
      redis: { host: 'example.com', port: 6380, tls: {} },
    });

    expect(connection).toEqual({
      mode: 'options',
      options: { host: 'example.com', port: 6380, tls: {} },
    });
  });

  it('treats a config file object carrying sentinels as sentinel mode', () => {
    const connection = resolve([], noEnv, {
      redis: { sentinels: [{ host: 'a.example', port: 26379 }], name: 'mymaster', tls: {} },
    });

    expect(connection.mode).toBe('sentinel');
  });

  it('prefers an explicit Redis URL over a config file options object', () => {
    const connection = resolve(['--redis', 'redis://flag.example:6379'], noEnv, {
      redis: { host: 'file.example', port: 6380 },
    });

    expect(connection).toEqual({
      mode: 'url',
      url: 'redis://flag.example:6379',
      options: {},
    });
  });

  it('keeps a bracketed IPv6 sentinel address together with its port', () => {
    const connection = resolve(['--sentinel', '[::1]:26380', '--sentinel-name', 'mymaster']);

    expect(connection.options.sentinels).toEqual([{ host: '::1', port: 26380 }]);
  });

  it('reads a bare IPv6 sentinel address as a host, not as host plus port', () => {
    const connection = resolve(['--sentinel', '2001:db8::1', '--sentinel-name', 'mymaster']);

    expect(connection.options.sentinels).toEqual([{ host: '2001:db8::1', port: 26379 }]);
  });

  it('lets credential flags override a config file options object', () => {
    const connection = resolve(['--redis-password', 'hunter2'], noEnv, {
      redis: { host: 'example.com', password: 'stale' },
    });

    expect(connection.options).toMatchObject({ host: 'example.com', password: 'hunter2' });
  });
});

describe('resolveConnection with TLS', () => {
  const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';
  const caFile = join(mkdtempSync(join(tmpdir(), 'bull-board-tls-')), 'ca.pem');
  writeFileSync(caFile, pem);

  it('adds TLS settings to a rediss:// URL', () => {
    expect(
      resolve(['--redis', 'rediss://example.com:6380', '--tls-ca', caFile, '--tls-servername', 'x'])
    ).toEqual({
      mode: 'url',
      url: 'rediss://example.com:6380',
      options: { tls: { ca: pem, servername: 'x' } },
    });
  });

  it('rejects TLS flags with a redis:// URL instead of ignoring them', () => {
    expect(() => resolve(['--redis', 'redis://example.com', '--tls'])).toThrow(
      'Conflicting TLS settings. Asking for TLS: --tls. Asking for a plain connection: a redis:// URL.'
    );
  });

  it('takes PEM text from an environment variable, with escaped newlines', () => {
    const connection = resolve(['--redis', 'rediss://example.com'], {
      BULL_BOARD_REDIS_TLS_CA: pem.replace(/\n/g, '\\n'),
    } as NodeJS.ProcessEnv);

    expect(connection.options.tls).toEqual({ ca: pem });
  });

  it('names the flag when a PEM file cannot be read', () => {
    expect(() =>
      resolve(['--redis', 'rediss://example.com', '--tls-ca', '/nonexistent/ca.pem'])
    ).toThrow('Could not read --tls-ca file /nonexistent/ca.pem');
  });

  it('rejects a client certificate without its key', () => {
    expect(() => resolve(['--redis', 'rediss://example.com', '--tls-cert', caFile])).toThrow(
      '--tls-cert and --tls-key go together'
    );
  });

  it('turns verification off with --tls-insecure', () => {
    expect(resolve(['--cluster', 'a.example', '--tls-insecure']).options.tls).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('enables TLS for the master behind sentinels, which ioredis otherwise drops', () => {
    expect(
      resolve(['--sentinel', 's.example', '--sentinel-name', 'm', '--tls-ca', caFile]).options
    ).toMatchObject({ tls: { ca: pem }, enableTLSForSentinelMode: true });
  });

  it('encrypts sentinel connections with --sentinel-tls, without the data node servername', () => {
    const { options } = resolve([
      '--sentinel',
      's.example',
      '--sentinel-name',
      'm',
      '--sentinel-tls',
      '--tls-ca',
      caFile,
      '--tls-servername',
      'master.example',
    ]);

    expect(options.sentinelTLS).toEqual({ ca: pem });
    expect(options.tls).toEqual({ ca: pem, servername: 'master.example' });
  });

  it('rejects --sentinel-tls outside sentinel mode', () => {
    expect(() => resolve(['--cluster', 'a.example', '--sentinel-tls'])).toThrow(
      '--sentinel-tls only applies when connecting through --sentinel'
    );
  });

  it('rejects TLS flags alongside explicit redis:// cluster nodes', () => {
    expect(() => resolve(['--cluster', 'redis://a.example', '--tls'])).toThrow(
      'Asking for TLS: --tls. Asking for a plain connection: redis:// cluster nodes.'
    );
  });

  it('rejects a config file tls block alongside explicit redis:// cluster nodes', () => {
    expect(() =>
      resolve(['--cluster', 'redis://a.example'], noEnv, { redis: { tls: { ca: 'file-ca' } } })
    ).toThrow(
      "Asking for TLS: the config file's redis.tls. Asking for a plain connection: redis:// cluster nodes."
    );
  });

  it('rejects rediss:// cluster nodes when the config file turns tls off', () => {
    expect(() =>
      resolve(['--cluster', 'rediss://a.example'], noEnv, {
        redis: { tls: false as unknown as undefined },
      })
    ).toThrow('Asking for a plain connection: redis.tls: false in the config file.');
  });

  it('rejects BULL_BOARD_REDIS_TLS=false next to anything that turns TLS on', () => {
    const off = { BULL_BOARD_REDIS_TLS: 'false' } as NodeJS.ProcessEnv;

    expect(() => resolve(['--redis', 'rediss://example.com'], off)).toThrow(
      'Asking for TLS: a rediss:// URL. Asking for a plain connection: BULL_BOARD_REDIS_TLS=false.'
    );
    expect(() => resolve(['--cluster', 'a.example', '--tls-ca', caFile], off)).toThrow(
      'Asking for TLS: --tls-ca.'
    );
    expect(() => resolve([], off, { redis: { host: 'a.example', tls: {} } })).toThrow(
      "Asking for TLS: the config file's redis.tls."
    );
    expect(resolve(['--redis', 'redis://example.com'], off).options).toEqual({});
  });

  it('reads TLS environment switches strictly, so "off" never means on', () => {
    const connection = resolve(['--cluster', 'a.example', '--tls'], {
      BULL_BOARD_REDIS_TLS_INSECURE: 'off',
    } as NodeJS.ProcessEnv);

    expect(connection.options.tls).toEqual({});
    expect(() =>
      resolve(['--cluster', 'a.example'], { BULL_BOARD_REDIS_TLS: 'enabled' } as NodeJS.ProcessEnv)
    ).toThrow('Invalid BULL_BOARD_REDIS_TLS: "enabled". Use true or false.');
    expect(
      resolve(['--cluster', 'a.example'], { BULL_BOARD_REDIS_TLS: '' } as NodeJS.ProcessEnv).options
    ).toEqual({});
  });

  it('enables TLS for the master when only the config file sets tls under sentinels', () => {
    const tls = { ca: 'file-ca' };

    expect(
      resolve(['--sentinel', 's.example', '--sentinel-name', 'm'], noEnv, { redis: { tls } })
        .options
    ).toMatchObject({ tls, enableTLSForSentinelMode: true });
    expect(
      resolve([], noEnv, {
        redis: { sentinels: [{ host: 's.example', port: 26379 }], name: 'm', tls },
      }).options
    ).toMatchObject({ tls, enableTLSForSentinelMode: true });
  });

  it('rejects a sentinel config that sets tls but turns it off for the master', () => {
    expect(() =>
      resolve(['--sentinel', 's.example', '--sentinel-name', 'm'], noEnv, {
        redis: { tls: {}, enableTLSForSentinelMode: false },
      })
    ).toThrow(
      'Asking for a plain connection: redis.enableTLSForSentinelMode: false in the config file.'
    );
  });

  it('rejects --sentinel-tls when BULL_BOARD_SENTINEL_TLS or the config file turns it off', () => {
    const sentinel = ['--sentinel', 's.example', '--sentinel-name', 'm'];

    expect(() =>
      resolve([...sentinel], { BULL_BOARD_SENTINEL_TLS: 'false' } as NodeJS.ProcessEnv, {
        redis: { sentinelTLS: {} },
      })
    ).toThrow('Conflicting sentinel TLS settings.');
    expect(() =>
      resolve([...sentinel, '--sentinel-tls'], noEnv, {
        redis: { sentinelTLS: false as unknown as undefined },
      })
    ).toThrow('Conflicting sentinel TLS settings.');
  });

  it('rejects cluster.options.redisOptions, which would otherwise be dropped', () => {
    expect(() =>
      resolve(['--cluster', 'a.example'], noEnv, {
        cluster: { options: { redisOptions: { tls: {} } } as never },
      })
    ).toThrow('cluster.options.redisOptions is not used');
  });

  it('keeps a named ioredis TLS profile when flags add to it', () => {
    const connection = resolve(['--cluster', 'a.example', '--tls-servername', 'x'], noEnv, {
      redis: { tls: 'RedisCloudFixed' as never },
    });

    expect(connection.options.tls).toEqual({ profile: 'RedisCloudFixed', servername: 'x' });
  });

  it('merges TLS flags into the config file tls block field by field', () => {
    const connection = resolve(['--cluster', 'a.example', '--tls-servername', 'x'], noEnv, {
      redis: { tls: { ca: 'file-ca', servername: 'stale' } },
    });

    expect(connection.options.tls).toEqual({ ca: 'file-ca', servername: 'x' });
  });

  it('applies a config file object under --sentinel too', () => {
    const connection = resolve(['--sentinel', 's.example', '--sentinel-name', 'm'], noEnv, {
      redis: { sentinelTLS: { ca: 'file-ca' } },
    });

    expect(connection.options).toMatchObject({ sentinelTLS: { ca: 'file-ca' }, name: 'm' });
  });

  it('builds a cluster from the config file cluster key, with --cluster overriding its nodes', () => {
    const file = {
      cluster: {
        nodes: ['rediss://file.example:7000'],
        options: { natMap: { '10.0.0.1:6379': { host: 'public.example', port: 6379 } } },
      },
    };

    expect(resolve([], noEnv, file)).toMatchObject({
      mode: 'cluster',
      nodes: [{ host: 'file.example', port: 7000 }],
      options: { tls: {} },
      clusterOptions: file.cluster.options,
    });
    expect(resolve(['--cluster', 'flag.example'], noEnv, file)).toMatchObject({
      nodes: [{ host: 'flag.example', port: 6379 }],
      clusterOptions: file.cluster.options,
    });
  });

  it('rejects a config file cluster key next to another topology', () => {
    expect(() =>
      resolve(['--redis', 'redis://x'], noEnv, { cluster: { nodes: 'a.example' } })
    ).toThrow("The config file's cluster key cannot be used with a Redis URL.");
    expect(() => resolve([], noEnv, { cluster: { options: {} } })).toThrow(
      'needs cluster.nodes, or pass --cluster'
    );
  });
});
