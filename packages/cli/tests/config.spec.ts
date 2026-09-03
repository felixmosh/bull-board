import { parseFlags } from '../src/config/flags';
import { resolveConfig } from '../src/config/resolve';

const noFile = {};
const noEnv = {} as NodeJS.ProcessEnv;

describe('parseFlags', () => {
  it('accepts the short forms of -r, -p, -h and -v, as documented in the README', () => {
    expect(parseFlags(['-r', 'redis://localhost:6379', '-p', '4000'])).toMatchObject({
      redis: 'redis://localhost:6379',
      port: '4000',
    });
    expect(parseFlags(['-h'])).toMatchObject({ help: true });
    expect(parseFlags(['-v'])).toMatchObject({ version: true });
  });

  it('parses --no-open as open: false', () => {
    expect(parseFlags(['--no-open'])).toMatchObject({ 'no-open': true });
  });

  it('parses long flags alongside short ones', () => {
    expect(
      parseFlags(['-r', 'redis://localhost:6379', '--read-only', '--base-path', '/queues'])
    ).toMatchObject({
      redis: 'redis://localhost:6379',
      'read-only': true,
      'base-path': '/queues',
    });
  });
});

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

  it('lets an explicit false at a higher layer beat a true at a lower one', () => {
    const config = resolveConfig({
      flags: parseFlags([]),
      env: { BULL_BOARD_READ_ONLY: '0' } as NodeJS.ProcessEnv,
      file: { readOnly: true },
    });

    expect(config.readOnly).toBe(false);
  });

  it('rejects a non-numeric port', () => {
    expect(() =>
      resolveConfig({ flags: parseFlags(['--port', 'abc']), env: noEnv, file: noFile })
    ).toThrow(/port/i);
  });

  it('resolves --browser in flag, BULL_BOARD_BROWSER, BROWSER, config file order', () => {
    const fromFlag = resolveConfig({
      flags: parseFlags(['--browser', 'flag-browser']),
      env: {
        BULL_BOARD_BROWSER: 'env-specific-browser',
        BROWSER: 'env-browser',
      } as NodeJS.ProcessEnv,
      file: { browser: 'file-browser' },
    });
    expect(fromFlag.browser).toBe('flag-browser');

    const fromBullBoardEnv = resolveConfig({
      flags: parseFlags([]),
      env: {
        BULL_BOARD_BROWSER: 'env-specific-browser',
        BROWSER: 'env-browser',
      } as NodeJS.ProcessEnv,
      file: { browser: 'file-browser' },
    });
    expect(fromBullBoardEnv.browser).toBe('env-specific-browser');

    const fromBrowserEnv = resolveConfig({
      flags: parseFlags([]),
      env: { BROWSER: 'env-browser' } as NodeJS.ProcessEnv,
      file: { browser: 'file-browser' },
    });
    expect(fromBrowserEnv.browser).toBe('env-browser');

    const fromFile = resolveConfig({
      flags: parseFlags([]),
      env: noEnv,
      file: { browser: 'file-browser' },
    });
    expect(fromFile.browser).toBe('file-browser');

    const fromDefault = resolveConfig({ flags: parseFlags([]), env: noEnv, file: noFile });
    expect(fromDefault.browser).toBeUndefined();
  });

  it('lets --no-open win over --browser, BULL_BOARD_BROWSER, BROWSER and the config file', () => {
    const config = resolveConfig({
      flags: parseFlags(['--no-open', '--browser', 'flag-browser']),
      env: {
        BULL_BOARD_BROWSER: 'env-specific-browser',
        BROWSER: 'env-browser',
      } as NodeJS.ProcessEnv,
      file: { browser: 'file-browser' },
    });

    expect(config.open).toBe(false);
  });

  it('leaves history off until something asks for it', () => {
    expect(resolveConfig({ flags: parseFlags([]), env: noEnv, file: noFile }).history).toBeNull();
  });

  it('turns history on from a flag, an env var or the config file, in that order', () => {
    const fromFlag = resolveConfig({
      flags: parseFlags(['--history', '--history-retention-days', '30']),
      env: { BULL_BOARD_HISTORY_RETENTION_DAYS: '60' } as NodeJS.ProcessEnv,
      file: { history: { retentionDays: 90 } },
    });
    expect(fromFlag.history).toMatchObject({ record: true, retentionDays: 30, latency: true });

    const fromEnv = resolveConfig({
      flags: parseFlags([]),
      env: {
        BULL_BOARD_HISTORY: 'true',
        BULL_BOARD_HISTORY_RETENTION_DAYS: '60',
      } as NodeJS.ProcessEnv,
      file: { history: { retentionDays: 90 } },
    });
    expect(fromEnv.history).toMatchObject({ retentionDays: 60 });

    const fromFile = resolveConfig({
      flags: parseFlags([]),
      env: noEnv,
      file: { history: { enabled: true, retentionDays: 90, latency: false } },
    });
    expect(fromFile.history).toMatchObject({ retentionDays: 90, latency: false });

    const fromShorthand = resolveConfig({
      flags: parseFlags([]),
      env: noEnv,
      file: { history: true },
    });
    expect(fromShorthand.history).toMatchObject({ record: true });
  });

  it('stops recording under --read-only, unless the config file asks for it explicitly', () => {
    const readOnly = resolveConfig({
      flags: parseFlags(['--history', '--read-only']),
      env: noEnv,
      file: noFile,
    });
    expect(readOnly.history).toMatchObject({ record: false });

    const explicit = resolveConfig({
      flags: parseFlags(['--history', '--read-only']),
      env: noEnv,
      file: { history: { record: true } },
    });
    expect(explicit.history).toMatchObject({ record: true });
  });

  it('turns showMetrics on with history, without overriding an explicit false', () => {
    const derived = resolveConfig({ flags: parseFlags(['--history']), env: noEnv, file: noFile });
    expect(derived.uiConfig.showMetrics).toBe(true);

    const explicit = resolveConfig({
      flags: parseFlags(['--history']),
      env: noEnv,
      file: { uiConfig: { showMetrics: false } },
    });
    expect(explicit.uiConfig.showMetrics).toBe(false);

    const off = resolveConfig({ flags: parseFlags([]), env: noEnv, file: noFile });
    expect(off.uiConfig.showMetrics).toBeUndefined();
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
