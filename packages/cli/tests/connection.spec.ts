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
    ).toThrow('Use either a Redis URL or --sentinel, not both.');
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
