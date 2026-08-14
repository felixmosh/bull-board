import { execSync, spawn, type ChildProcessByStdio } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import BullQueue from 'bull';
import { Queue as BullMQQueue } from 'bullmq';
import { Redis } from 'ioredis';

// This suite spawns the real compiled binary (dist/bin.js) as a child process against a
// real Redis, rather than importing `run()` in-process. That is the only way to exercise
// argv parsing, the compiled CommonJS output, process exit codes, and signal handling.

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const REDIS_URL = `redis://${REDIS_HOST}:${REDIS_PORT}`;
const redisOptions = { host: REDIS_HOST, port: +REDIS_PORT };

const CLI_ROOT = join(__dirname, '..');
const BIN_PATH = join(CLI_ROOT, 'dist', 'bin.js');
const PKG_VERSION = (
  JSON.parse(readFileSync(join(CLI_ROOT, 'package.json'), 'utf8')) as { version: string }
).version;

const BANNER_RE = /bull-board listening on (http:\/\/\S+)/;
const DEFAULT_BANNER_TIMEOUT_MS = 10000;
const STOP_TIMEOUT_MS = 10000;

let seq = 0;
function unique(label: string): string {
  seq += 1;
  return `cli-e2e-${label}-${process.pid}-${Date.now()}-${seq}`;
}

function spawnCli(args: string[]): ChildProcessByStdio<null, Readable, Readable> {
  return spawn(process.execPath, [BIN_PATH, ...args], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

interface CliHandle {
  url: string;
  stdout(): string;
  stderr(): string;
  /**
   * Sends SIGINT and resolves with the exit code once the process actually exits, forcing a
   * SIGKILL after `STOP_TIMEOUT_MS` if it does not.
   */
  stop(): Promise<number | null>;
}

/**
 * Starts the CLI and waits for its "listening" banner. Fails fast, with the full
 * accumulated stdout/stderr attached, if the banner never arrives or the process exits
 * first -- a bare timeout here would be miserable to debug.
 */
async function startCli(
  args: string[],
  {
    timeoutMs = DEFAULT_BANNER_TIMEOUT_MS,
    allowOpen = false,
  }: { timeoutMs?: number; allowOpen?: boolean } = {}
): Promise<CliHandle> {
  // Every test opts out of the real browser launch by default: nothing here should pop a
  // window, and (as a former real bug covered by the `allowOpen` test below) skipping it
  // also removes a source of timing noise between the "listening" banner and the process
  // being ready to shut down.
  const child = spawnCli(allowOpen || args.includes('--no-open') ? args : [...args, '--no-open']);
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk: Buffer) => {
    out += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    err += chunk.toString();
  });

  const url = await new Promise<string>((resolve, reject) => {
    const fail = (reason: string) => {
      clearTimeout(timer);
      reject(
        new Error(
          `${reason}\nargs: ${args.join(' ')}\n--- stdout ---\n${out}\n--- stderr ---\n${err}`
        )
      );
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      fail(`Timed out after ${timeoutMs}ms waiting for the bull-board banner.`);
    }, timeoutMs);

    child.stdout.on('data', () => {
      const match = out.match(BANNER_RE);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });

    child.once('exit', (code, signal) => {
      fail(`bull-board exited before printing its banner (code=${code}, signal=${signal}).`);
    });
  });

  return {
    url,
    stdout: () => out,
    stderr: () => err,
    stop: () =>
      new Promise<number | null>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve(child.exitCode);
          return;
        }
        // Mirrors the SIGKILL fallback in startCli/runToExit: if a signal-handling
        // regression ever makes SIGINT stop working, this must not leave dist/bin.js
        // (and its live Redis connection) running past the test that started it.
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
        }, STOP_TIMEOUT_MS);
        child.once('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
        child.kill('SIGINT');
      }),
  };
}

/** For flows that never print a banner: `--help`, `--version`, and every failure exit. */
async function runToExit(
  args: string[],
  { timeoutMs = DEFAULT_BANNER_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawnCli(args);
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk: Buffer) => {
    out += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    err += chunk.toString();
  });

  const code = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(
          `Timed out after ${timeoutMs}ms waiting for exit.\nargs: ${args.join(' ')}\n` +
            `--- stdout ---\n${out}\n--- stderr ---\n${err}`
        )
      );
    }, timeoutMs);

    child.once('exit', (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });

  return { code, stdout: out, stderr: err };
}

/** A TCP port nothing is listening on, freed right before use. */
async function unusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close((closeError) => (closeError ? reject(closeError) : resolve(port)));
    });
  });
}

async function keysUnder(client: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, found] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    cursor = next;
    keys.push(...found);
  } while (cursor !== '0');

  return keys.sort();
}

/**
 * A key-name diff alone would pass even if the CLI mutated a value, added a hash field, or
 * changed a TTL on a key it did not create or delete -- exactly the shape a read-only-observer
 * bug takes. `DUMP` serializes a key's full value regardless of type, and `PTTL` alongside it
 * catches an expiry change; only the string 'has a TTL or not' matters, since a live TTL ticks
 * down on its own between the two snapshots.
 */
async function keyspaceSnapshot(client: Redis, prefix: string): Promise<Record<string, string>> {
  const keys = await keysUnder(client, `${prefix}:*`);
  const entries: Record<string, string> = {};
  for (const key of keys) {
    const [dump, pttl] = await Promise.all([client.dumpBuffer(key), client.pttl(key)]);
    entries[key] = `${dump?.toString('base64') ?? 'nil'}:${pttl >= 0 ? 'ttl' : String(pttl)}`;
  }

  return entries;
}

async function deleteKeysUnder(client: Redis, pattern: string): Promise<void> {
  const keys = await keysUnder(client, pattern);
  if (keys.length > 0) {
    await client.del(...keys);
  }
}

const authHeader = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

describe('cli', () => {
  let client: Redis;

  beforeAll(async () => {
    if (!existsSync(BIN_PATH)) {
      execSync('yarn build', { cwd: CLI_ROOT, stdio: 'inherit' });
    }
    client = new Redis({ ...redisOptions, maxRetriesPerRequest: null });
    await new Promise<void>((resolve) => client.once('ready', () => resolve()));
  }, 120000);

  afterAll(async () => {
    await client.quit();
  });

  it('discovers a BullMQ queue and a Bull queue through the real binary', async () => {
    const mqName = unique('disc-mq');
    const bullName = unique('disc-bull');
    const mq = new BullMQQueue(mqName, { connection: redisOptions });
    const bull = new BullQueue(bullName, { redis: redisOptions });
    await mq.waitUntilReady();
    await bull.add('seed', {});

    try {
      const cli = await startCli(['--redis', REDIS_URL, '--scan-interval', '0', '--port', '0']);
      try {
        const response = await fetch(`${cli.url}/api/queues`);
        const body = (await response.json()) as { queues: Array<{ name: string }> };

        expect(response.status).toBe(200);
        expect(body.queues.map((q) => q.name)).toEqual(expect.arrayContaining([mqName, bullName]));
      } finally {
        await cli.stop();
      }
    } finally {
      // Each cleanup step is independently guarded: one throwing (contention, a transient
      // blip) must not skip the rest and leak a connection or a key.
      await mq.obliterate({ force: true }).catch(() => {});
      await bull.obliterate({ force: true }).catch(() => {});
      await mq.close().catch(() => {});
      await bull.close().catch(() => {});
      await deleteKeysUnder(client, `bull:${mqName}:*`).catch(() => {});
      await deleteKeysUnder(client, `bull:${bullName}:*`).catch(() => {});
    }
  });

  it('scopes discovery to the given prefix', async () => {
    const prefix = unique('prefix-scope');
    const name = unique('prefix-scope-q');
    const queue = new BullMQQueue(name, { connection: redisOptions, prefix });
    await queue.waitUntilReady();

    try {
      const withoutPrefix = await startCli([
        '--redis',
        REDIS_URL,
        '--scan-interval',
        '0',
        '--port',
        '0',
      ]);
      try {
        const body = (await (await fetch(`${withoutPrefix.url}/api/queues`)).json()) as {
          queues: Array<{ name: string }>;
        };
        expect(body.queues.map((q) => q.name)).not.toContain(name);
      } finally {
        await withoutPrefix.stop();
      }

      const withPrefix = await startCli([
        '--redis',
        REDIS_URL,
        '--prefix',
        prefix,
        '--scan-interval',
        '0',
        '--port',
        '0',
      ]);
      try {
        const body = (await (await fetch(`${withPrefix.url}/api/queues`)).json()) as {
          queues: Array<{ name: string }>;
        };
        expect(body.queues.map((q) => q.name)).toContain(name);
      } finally {
        await withPrefix.stop();
      }
    } finally {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close().catch(() => {});
      await deleteKeysUnder(client, `${prefix}:${name}:*`).catch(() => {});
    }
  });

  it('serves only the queues named by --queues, even though others exist under the same prefix', async () => {
    const prefix = unique('explicit-queues');
    const wantedName = unique('explicit-wanted');
    const otherName = unique('explicit-other');
    const wanted = new BullMQQueue(wantedName, { connection: redisOptions, prefix });
    const other = new BullMQQueue(otherName, { connection: redisOptions, prefix });
    await wanted.waitUntilReady();
    await other.waitUntilReady();

    try {
      const cli = await startCli([
        '--redis',
        REDIS_URL,
        '--prefix',
        prefix,
        '--queues',
        wantedName,
        '--scan-interval',
        '0',
        '--port',
        '0',
      ]);
      try {
        const body = (await (await fetch(`${cli.url}/api/queues`)).json()) as {
          queues: Array<{ name: string }>;
        };
        expect(body.queues.map((q) => q.name)).toEqual([wantedName]);
      } finally {
        await cli.stop();
      }
    } finally {
      await wanted.obliterate({ force: true }).catch(() => {});
      await other.obliterate({ force: true }).catch(() => {});
      await wanted.close().catch(() => {});
      await other.close().catch(() => {});
      await deleteKeysUnder(client, `${prefix}:${wantedName}:*`).catch(() => {});
      await deleteKeysUnder(client, `${prefix}:${otherName}:*`).catch(() => {});
    }
  });

  it('picks up a queue created after startup without a restart', async () => {
    const prefix = unique('rescan');
    const name = unique('rescan-q');
    let queue: BullMQQueue | undefined;

    try {
      const cli = await startCli([
        '--redis',
        REDIS_URL,
        '--prefix',
        prefix,
        '--scan-interval',
        '1',
        '--port',
        '0',
      ]);
      try {
        const before = (await (await fetch(`${cli.url}/api/queues`)).json()) as {
          queues: Array<{ name: string }>;
        };
        expect(before.queues.map((q) => q.name)).not.toContain(name);

        queue = new BullMQQueue(name, { connection: redisOptions, prefix });
        await queue.waitUntilReady();

        const deadline = Date.now() + 15000;
        let found = false;
        while (Date.now() < deadline && !found) {
          const body = (await (await fetch(`${cli.url}/api/queues`)).json()) as {
            queues: Array<{ name: string }>;
          };
          found = body.queues.map((q) => q.name).includes(name);
          if (!found) await new Promise((resolve) => setTimeout(resolve, 300));
        }

        expect(found).toBe(true);
      } finally {
        await cli.stop();
      }
    } finally {
      if (queue) {
        await queue.obliterate({ force: true }).catch(() => {});
        await queue.close().catch(() => {});
      }
      await deleteKeysUnder(client, `${prefix}:${name}:*`).catch(() => {});
    }
  }, 30000);

  it('enforces --read-only on a destructive endpoint, and only when the flag is set', async () => {
    const prefix = unique('readonly');
    const name = unique('readonly-q');
    const queue = new BullMQQueue(name, { connection: redisOptions, prefix });
    await queue.waitUntilReady();

    try {
      const readOnlyCli = await startCli([
        '--redis',
        REDIS_URL,
        '--prefix',
        prefix,
        '--queues',
        name,
        '--read-only',
        '--scan-interval',
        '0',
        '--port',
        '0',
      ]);
      try {
        const response = await fetch(`${readOnlyCli.url}/api/queues/${name}/pause`, {
          method: 'PUT',
        });
        expect(response.status).toBe(405);
      } finally {
        await readOnlyCli.stop();
      }

      const writableCli = await startCli([
        '--redis',
        REDIS_URL,
        '--prefix',
        prefix,
        '--queues',
        name,
        '--scan-interval',
        '0',
        '--port',
        '0',
      ]);
      try {
        const pauseResponse = await fetch(`${writableCli.url}/api/queues/${name}/pause`, {
          method: 'PUT',
        });
        expect(pauseResponse.status).toBeLessThan(300);

        const resumeResponse = await fetch(`${writableCli.url}/api/queues/${name}/resume`, {
          method: 'PUT',
        });
        expect(resumeResponse.status).toBeLessThan(300);
      } finally {
        await writableCli.stop();
      }
    } finally {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close().catch(() => {});
      await deleteKeysUnder(client, `${prefix}:${name}:*`).catch(() => {});
    }
  });

  it('enforces basic auth, with a WWW-Authenticate challenge on a 401', async () => {
    const prefix = unique('auth');
    const user = 'e2e-user';
    const password = 'e2e-password';
    const cli = await startCli([
      '--redis',
      REDIS_URL,
      '--prefix',
      prefix,
      '--user',
      user,
      '--password',
      password,
      '--scan-interval',
      '0',
      '--port',
      '0',
    ]);

    try {
      const noAuth = await fetch(`${cli.url}/api/queues`);
      expect(noAuth.status).toBe(401);
      expect(noAuth.headers.get('www-authenticate')).toMatch(/^Basic /);

      const correct = await fetch(`${cli.url}/api/queues`, {
        headers: { Authorization: authHeader(user, password) },
      });
      expect(correct.status).toBe(200);

      const wrong = await fetch(`${cli.url}/api/queues`, {
        headers: { Authorization: authHeader(user, 'not-the-password') },
      });
      expect(wrong.status).toBe(401);
      expect(wrong.headers.get('www-authenticate')).toMatch(/^Basic /);
    } finally {
      await cli.stop();
    }
  });

  it('serves the API and the entry HTML under a base path', async () => {
    const prefix = unique('base-path');
    const cli = await startCli([
      '--redis',
      REDIS_URL,
      '--prefix',
      prefix,
      '--base-path',
      '/queues',
      '--scan-interval',
      '0',
      '--port',
      '0',
    ]);

    try {
      expect(cli.url).toMatch(/\/queues$/);

      const api = await fetch(`${cli.url}/api/queues`);
      expect(api.status).toBe(200);

      const html = await (await fetch(`${cli.url}/`)).text();
      expect(html).toContain('<base href="/queues/" />');
    } finally {
      await cli.stop();
    }
  });

  it('is not an error to have zero queues, and says so on stdout', async () => {
    const prefix = unique('empty');
    const cli = await startCli([
      '--redis',
      REDIS_URL,
      '--prefix',
      prefix,
      '--scan-interval',
      '0',
      '--port',
      '0',
    ]);

    try {
      const body = (await (await fetch(`${cli.url}/api/queues`)).json()) as {
        queues: unknown[];
      };
      expect(body.queues).toEqual([]);
      expect(cli.stdout()).toMatch(new RegExp(`No queues found under ${prefix}`));
    } finally {
      await cli.stop();
    }
  });

  it('honours a real bull-board.config.mjs, loaded through a real dynamic import', async () => {
    const prefix = unique('config-file');
    const cwd = mkdtempSync(join(tmpdir(), 'bull-board-cli-e2e-'));
    const configPath = join(cwd, 'bull-board.config.mjs');
    const title = `E2E Custom Title ${unique('title')}`;
    writeFileSync(
      configPath,
      `export default { uiConfig: { boardTitle: ${JSON.stringify(title)} } };\n`
    );

    const cli = await startCli([
      '--redis',
      REDIS_URL,
      '--prefix',
      prefix,
      '--config',
      configPath,
      '--scan-interval',
      '0',
      '--port',
      '0',
    ]);

    try {
      const html = await (await fetch(`${cli.url}/`)).text();
      expect(html).toContain(`<title>${title}</title>`);
    } finally {
      await cli.stop();
    }
  });

  describe('failure exits', () => {
    it('exits non-zero naming the URL and the underlying cause when Redis is unreachable, with no stack trace', async () => {
      const port = await unusedPort();
      const url = `redis://localhost:${port}`;

      const { code, stderr } = await runToExit(['--redis', url, '--port', '0']);

      expect(code).not.toBe(0);
      expect(stderr).toContain(url);
      // The cause must survive: not just "Could not connect to Redis at <url>: " with
      // nothing after the colon.
      expect(stderr.trim()).not.toMatch(/:\s*$/);
      expect(stderr).toMatch(/ECONNREFUSED/);
      expect(stderr).not.toMatch(/\n\s+at\s/);
    });

    it('exits non-zero naming the protocol when the Redis URL uses the wrong scheme', async () => {
      const { code, stderr } = await runToExit(['--redis', 'http://localhost:6379', '--port', '0']);

      expect(code).not.toBe(0);
      expect(stderr).toContain('http:');
      expect(stderr).toMatch(/redis:\/\/ or rediss:\/\//);
    });

    it('exits non-zero and points at --help for an unknown flag', async () => {
      const { code, stderr } = await runToExit(['--this-flag-does-not-exist']);

      expect(code).not.toBe(0);
      expect(stderr).toMatch(/--help/);
    });
  });

  it('--help exits 0 and mentions the main flags', async () => {
    const { code, stdout } = await runToExit(['--help']);

    expect(code).toBe(0);
    expect(stdout).toContain('--redis');
    expect(stdout).toContain('--port');
    expect(stdout).toContain('--read-only');
    expect(stdout).toContain('--prefix');
  });

  it('--version prints the package version', async () => {
    const { code, stdout } = await runToExit(['--version']);

    expect(code).toBe(0);
    expect(stdout.trim()).toBe(PKG_VERSION);
  });

  it('shuts down cleanly on SIGINT', async () => {
    const prefix = unique('shutdown');
    const cli = await startCli([
      '--redis',
      REDIS_URL,
      '--prefix',
      prefix,
      '--scan-interval',
      '0',
      '--port',
      '0',
    ]);

    const code = await cli.stop();

    expect(code).toBe(0);
  });

  // `bin.ts` used to call `openBrowser()` (which shells out to spawn a real "open a URL"
  // process) before registering the SIGINT/SIGTERM handlers, which raced a signal arriving
  // right after the "listening" banner against the handlers actually existing. That race is
  // now structurally impossible: `run()`'s `beforeReady` hook arms the handlers before
  // `bin.ts` ever calls `openBrowser()`, so this can no longer reproduce the original bug
  // regardless of `--open`. It still earns its place as the one test that exercises SIGINT
  // landing alongside a real OS spawn, which is a plausible source of its own timing noise;
  // the plain SIGINT test above is what actually guards the fix now. This is the one test in
  // the suite that does not pass `--no-open`; on a machine with a real "open"/"xdg-open"
  // binary, expect a browser tab to flash open briefly.
  it('shuts down cleanly on SIGINT even with --open, immediately after the banner', async () => {
    const prefix = unique('shutdown-open');
    const cli = await startCli(
      ['--redis', REDIS_URL, '--prefix', prefix, '--scan-interval', '0', '--port', '0'],
      { allowOpen: true }
    );

    const code = await cli.stop();

    expect(code).toBe(0);
  });

  it('falls back and keeps serving when --browser names a command that does not exist', async () => {
    const prefix = unique('bad-browser');
    const cli = await startCli(
      [
        '--redis',
        REDIS_URL,
        '--prefix',
        prefix,
        '--scan-interval',
        '0',
        '--port',
        '0',
        '--browser',
        'this-browser-command-does-not-exist-1351',
      ],
      { allowOpen: true }
    );

    try {
      const fallbackLine = `Could not open a browser automatically. Open ${cli.url} yourself.`;
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline && !cli.stdout().includes(fallbackLine)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(cli.stdout()).toContain(fallbackLine);

      const response = await fetch(`${cli.url}/api/queues`);
      expect(response.status).toBe(200);
    } finally {
      await cli.stop();
    }
  });

  it('never mutates the Redis keys it observes', async () => {
    const prefix = unique('no-mutate');
    const mqName = unique('no-mutate-mq');
    const bullName = unique('no-mutate-bull');
    const mq = new BullMQQueue(mqName, { connection: redisOptions, prefix });
    const bull = new BullQueue(bullName, { prefix, redis: redisOptions });
    await mq.waitUntilReady();
    await bull.add('seed', {});

    try {
      const before = await keyspaceSnapshot(client, prefix);
      expect(Object.keys(before).length).toBeGreaterThan(0);

      const cli = await startCli([
        '--redis',
        REDIS_URL,
        '--prefix',
        prefix,
        '--scan-interval',
        '0',
        '--port',
        '0',
      ]);
      try {
        const body = (await (await fetch(`${cli.url}/api/queues`)).json()) as {
          queues: Array<{ name: string }>;
        };
        expect(body.queues.map((q) => q.name)).toEqual(expect.arrayContaining([mqName, bullName]));
      } finally {
        await cli.stop();
      }

      const after = await keyspaceSnapshot(client, prefix);
      expect(after).toEqual(before);
    } finally {
      await mq.obliterate({ force: true }).catch(() => {});
      await bull.obliterate({ force: true }).catch(() => {});
      await mq.close().catch(() => {});
      await bull.close().catch(() => {});
      await deleteKeysUnder(client, `${prefix}:*`).catch(() => {});
    }
  });
});
