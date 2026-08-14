import { parseFlags } from '../src/config/flags';
import { resolveConfig } from '../src/config/resolve';

const noFile = {};
const noEnv = {} as NodeJS.ProcessEnv;

describe('resolveConfig', () => {
  it('falls back to defaults when nothing is supplied', () => {
    const config = resolveConfig({ flags: parseFlags([]), env: noEnv, file: noFile });

    expect(config).toMatchObject({
      redisUrl: 'redis://localhost:6379',
      port: 3000,
      host: '127.0.0.1',
      prefixes: ['bull'],
      queueNames: null,
      scanInterval: 10,
      basePath: '',
      readOnly: false,
      auth: null,
      open: true,
    });
  });

  it('prefers a flag over env, config file and default', () => {
    const config = resolveConfig({
      flags: parseFlags(['--port', '4000']),
      env: { BULL_BOARD_PORT: '5000' } as NodeJS.ProcessEnv,
      file: { port: 6000 },
    });

    expect(config.port).toBe(4000);
  });

  it('prefers env over the config file', () => {
    const config = resolveConfig({
      flags: parseFlags([]),
      env: { BULL_BOARD_PORT: '5000' } as NodeJS.ProcessEnv,
      file: { port: 6000 },
    });

    expect(config.port).toBe(5000);
  });

  it('prefers the config file over the default', () => {
    const config = resolveConfig({ flags: parseFlags([]), env: noEnv, file: { port: 6000 } });

    expect(config.port).toBe(6000);
  });

  it('splits comma separated prefixes and queue names from every layer', () => {
    const fromFlag = resolveConfig({
      flags: parseFlags(['--prefix', 'a, b', '--queues', 'x,y']),
      env: noEnv,
      file: noFile,
    });
    const fromFile = resolveConfig({
      flags: parseFlags([]),
      env: noEnv,
      file: { prefix: ['a', 'b'], queues: ['x', 'y'] },
    });

    expect(fromFlag.prefixes).toEqual(['a', 'b']);
    expect(fromFlag.queueNames).toEqual(['x', 'y']);
    expect(fromFile.prefixes).toEqual(['a', 'b']);
    expect(fromFile.queueNames).toEqual(['x', 'y']);
  });

  it('normalizes the base path to a leading slash with no trailing slash', () => {
    expect(
      resolveConfig({ flags: parseFlags(['--base-path', 'queues/']), env: noEnv, file: noFile })
        .basePath
    ).toBe('/queues');
    expect(
      resolveConfig({ flags: parseFlags(['--base-path', '/']), env: noEnv, file: noFile }).basePath
    ).toBe('');
  });

  it('enables auth only when both user and password are present', () => {
    const both = resolveConfig({
      flags: parseFlags(['--user', 'admin', '--password', 'secret']),
      env: noEnv,
      file: noFile,
    });

    expect(both.auth).toEqual({ user: 'admin', password: 'secret' });
  });

  it('rejects a password without a user', () => {
    expect(() =>
      resolveConfig({ flags: parseFlags(['--password', 'secret']), env: noEnv, file: noFile })
    ).toThrow(/--user/);
  });

  it('reads boolean env vars as flags', () => {
    const config = resolveConfig({
      flags: parseFlags([]),
      env: { BULL_BOARD_READ_ONLY: '1', BULL_BOARD_OPEN: 'false' } as NodeJS.ProcessEnv,
      file: noFile,
    });

    expect(config.readOnly).toBe(true);
    expect(config.open).toBe(false);
  });

  it('rejects a non-numeric port', () => {
    expect(() =>
      resolveConfig({ flags: parseFlags(['--port', 'abc']), env: noEnv, file: noFile })
    ).toThrow(/port/i);
  });

  it('carries uiConfig and per-queue options through from the config file', () => {
    const config = resolveConfig({
      flags: parseFlags(['--board-title', 'Flag wins']),
      env: noEnv,
      file: {
        uiConfig: { boardTitle: 'File title', showMetrics: true },
        queues: { emails: { readOnlyMode: true } },
      },
    });

    expect(config.uiConfig).toEqual({ boardTitle: 'Flag wins', showMetrics: true });
    expect(config.queueOptions).toEqual({ emails: { readOnlyMode: true } });
  });
});
