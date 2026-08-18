import { execSync, spawn, type ChildProcessByStdio } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { connect as netConnect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import BullQueue from 'bull';
import { Queue as BullMQQueue } from 'bullmq';
import { Redis } from 'ioredis';

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
// Shutdown runs up to four sequential SHUTDOWN_GRACE_MS graces, so this has to clear 12000ms.
const STOP_TIMEOUT_MS = 15000;

let seq = 0;
function unique(label: string): string {
  seq += 1;
  return `cli-e2e-${label}-${process.pid}-${Date.now()}-${seq}`;
}

function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('BULL_BOARD_')) delete env[key];
  }

  return env;
}

function spawnCli(args: string[]): ChildProcessByStdio<null, Readable, Readable> {
  return spawn(process.execPath, [BIN_PATH, ...args], {
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

interface CliHandle {
  url: string;
  stdout(): string;
  stderr(): string;
  stop(): Promise<number | null>;
}

async function startCli(
  args: string[],
  {
    timeoutMs = DEFAULT_BANNER_TIMEOUT_MS,
    allowOpen = false,
  }: { timeoutMs?: number; allowOpen?: boolean } = {}
): Promise<CliHandle> {
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

function startForwarder(port: number, targetHost: string, targetPort: number) {
  const sockets = new Set<import('node:net').Socket>();
  const server = createServer((inbound) => {
    const outbound = netConnect(targetPort, targetHost);
    sockets.add(inbound);
    sockets.add(outbound);
    inbound.on('close', () => {
      sockets.delete(inbound);
      outbound.destroy();
    });
    outbound.on('close', () => {
      sockets.delete(outbound);
      inbound.destroy();
    });
    inbound.pipe(outbound);
    outbound.pipe(inbound);
    inbound.on('error', () => outbound.destroy());
    outbound.on('error', () => inbound.destroy());
  });

  return new Promise<{ close(): Promise<void> }>((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve({
        close: () =>
          new Promise<void>((closeResolve) => {
            server.close(() => closeResolve());
            for (const socket of sockets) socket.destroy();
          }),
      })
    );
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
    it('--no-retry exits non-zero naming the URL and the underlying cause when Redis is unreachable, with no stack trace, and serves nothing', async () => {
      const port = await unusedPort();
      const url = `redis://localhost:${port}`;

      const { code, stdout, stderr } = await runToExit([
        '--redis',
        url,
        '--port',
        '0',
        '--no-retry',
      ]);

      expect(code).not.toBe(0);
      expect(stderr).toContain(url);
      expect(stderr.trim()).not.toMatch(/:\s*$/);
      expect(stderr).toMatch(/ECONNREFUSED/);
      expect(stderr).not.toMatch(/\n\s+at\s/);
      expect(stdout).not.toMatch(/listening on/);
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

    it('exits non-zero naming the port when it is already in use, rather than printing a false "listening" banner', async () => {
      const port = await unusedPort();
      const blocker = createServer();
      await new Promise<void>((resolve, reject) => {
        blocker.on('error', reject);
        blocker.listen(port, '127.0.0.1', () => resolve());
      });

      try {
        const { code, stdout, stderr } = await runToExit([
          '--redis',
          REDIS_URL,
          '--port',
          String(port),
        ]);

        expect(code).not.toBe(0);
        expect(stderr).toContain(String(port));
        expect(stdout).not.toMatch(/listening on/);
      } finally {
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
      }
    });
  });

  describe('when Redis is unreachable', () => {
    it('serves a diagnostic page naming the URL and the underlying error, with a 503', async () => {
      const port = await unusedPort();
      const url = `redis://localhost:${port}`;
      const cli = await startCli(['--redis', url, '--port', '0']);

      try {
        const response = await fetch(`${cli.url}/`, { headers: { Accept: 'text/html' } });
        const body = await response.text();

        expect(response.status).toBe(503);
        expect(response.headers.get('content-type')).toMatch(/html/);
        expect(body).toContain(url);
        expect(body).toMatch(/ECONNREFUSED/);
      } finally {
        await cli.stop();
      }
    });

    it('returns 503 JSON, not HTML, for a request under the API path', async () => {
      const port = await unusedPort();
      const url = `redis://localhost:${port}`;
      const cli = await startCli(['--redis', url, '--port', '0']);

      try {
        const response = await fetch(`${cli.url}/api/queues`);
        const body = (await response.json()) as { error: { key: string }; code: string };

        expect(response.status).toBe(503);
        expect(response.headers.get('content-type')).toMatch(/json/);
        expect(response.headers.get('retry-after')).toBeTruthy();
        expect(body.error).toEqual({ key: 'ERRORS.REDIS_UNAVAILABLE' });
        expect(body.code).toBe('REDIS_UNAVAILABLE');
      } finally {
        await cli.stop();
      }
    });

    it('reports a disconnected state on the status endpoint', async () => {
      const port = await unusedPort();
      const url = `redis://localhost:${port}`;
      const cli = await startCli(['--redis', url, '--port', '0']);

      try {
        const response = await fetch(`${cli.url}/__bull-board-cli/status`);
        const body = (await response.json()) as {
          status: string;
          redisUrl: string;
          attempts: number;
        };

        expect(response.status).toBe(200);
        expect(body.status).not.toBe('connected');
        expect(body.redisUrl).toBe(url);
        expect(body.attempts).toBeGreaterThan(0);
      } finally {
        await cli.stop();
      }
    });

    it('requires basic auth for the diagnostic page and the status endpoint, and never leaks the Redis URL to an unauthenticated request', async () => {
      const port = await unusedPort();
      const url = `redis://localhost:${port}`;
      const user = 'diag-user';
      const password = 'diag-password';
      const cli = await startCli([
        '--redis',
        url,
        '--port',
        '0',
        '--user',
        user,
        '--password',
        password,
      ]);

      try {
        const unauthed = await fetch(`${cli.url}/`, { headers: { Accept: 'text/html' } });
        expect(unauthed.status).toBe(401);
        expect(await unauthed.text()).not.toContain(url);

        const unauthedStatus = await fetch(`${cli.url}/__bull-board-cli/status`);
        expect(unauthedStatus.status).toBe(401);

        const authed = await fetch(`${cli.url}/`, {
          headers: { Accept: 'text/html', Authorization: authHeader(user, password) },
        });
        expect(authed.status).toBe(503);
        expect(await authed.text()).toContain(url);

        const authedStatus = await fetch(`${cli.url}/__bull-board-cli/status`, {
          headers: { Authorization: authHeader(user, password) },
        });
        expect(authedStatus.status).toBe(200);
      } finally {
        await cli.stop();
      }
    });

    it('self heals: comes alive on its own once Redis becomes reachable, no restart needed', async () => {
      const port = await unusedPort();
      const url = `redis://localhost:${port}`;
      const cli = await startCli(['--redis', url, '--port', '0']);
      let forwarder: Awaited<ReturnType<typeof startForwarder>> | undefined;

      try {
        const diagnostic = await fetch(`${cli.url}/`, { headers: { Accept: 'text/html' } });
        expect(diagnostic.status).toBe(503);

        forwarder = await startForwarder(port, REDIS_HOST, +REDIS_PORT);

        const deadline = Date.now() + 20000;
        let healed = false;
        while (Date.now() < deadline && !healed) {
          const response = await fetch(`${cli.url}/api/queues`).catch(() => undefined);
          healed = response?.status === 200;
          if (!healed) await new Promise((resolve) => setTimeout(resolve, 300));
        }

        if (!healed) {
          throw new Error(
            `Never healed within the deadline.\n--- stdout ---\n${cli.stdout()}\n--- stderr ---\n${cli.stderr()}`
          );
        }
        expect(healed).toBe(true);
      } finally {
        await forwarder?.close();
        await cli.stop();
      }
    }, 45000);

    it('shuts down on SIGINT during an outage with a request in flight, without needing SIGKILL', async () => {
      const port = await unusedPort();
      const url = `redis://localhost:${port}`;
      const prefix = unique('outage-shutdown');
      const cli = await startCli([
        '--redis',
        url,
        '--prefix',
        prefix,
        '--scan-interval',
        '0',
        '--port',
        '0',
      ]);
      const forwarder = await startForwarder(port, REDIS_HOST, +REDIS_PORT);

      try {
        const deadline = Date.now() + 10000;
        let loadedStatus: number | undefined;
        while (Date.now() < deadline && loadedStatus !== 200) {
          loadedStatus = (await fetch(`${cli.url}/api/queues`)).status;
          if (loadedStatus !== 200) await new Promise((resolve) => setTimeout(resolve, 200));
        }
        expect(loadedStatus).toBe(200);

        await forwarder.close();

        void fetch(`${cli.url}/api/queues`).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 200));

        const code = await cli.stop();

        expect(code).toBe(0);
      } finally {
        await forwarder.close().catch(() => {});
        await cli.stop();
      }
    }, 30000);
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

  it('shuts down cleanly on SIGINT even with --open, immediately after the banner', async () => {
    const prefix = unique('shutdown-open');
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
        `${process.execPath} -e 0`,
      ],
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
