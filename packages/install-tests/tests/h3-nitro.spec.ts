import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const fixtureDir = path.resolve(__dirname, '..', 'fixtures', 'nitro');
const hasBun = spawnSync('bun', ['--version']).status === 0;

if (!hasBun && process.env.CI) {
  throw new Error('bun is not on PATH; CI must install it so the bun install case runs');
}

let workDir: string;
let tarballs: Record<string, string>;

beforeAll(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), 'bull-board-install-'));
  tarballs = Object.fromEntries(
    ['api', 'ui', 'h3'].map((name) => {
      const out = path.join(workDir, `${name}.tgz`);
      execFileSync('yarn', ['workspace', `@bull-board/${name}`, 'pack', '--out', out], {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      return [`@bull-board/${name}`, `file:${out}`];
    })
  );
});

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

function run(command: string, args: string[], cwd: string, env: Record<string, string> = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
}

function createProject(name: string) {
  const dir = path.join(workDir, name);
  cpSync(fixtureDir, dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'nitro-host',
      private: true,
      type: 'module',
      dependencies: { nitropack: '^2.13.6', ...tarballs },
      overrides: tarballs,
    })
  );
  return dir;
}

function start(runtime: string, cwd: string) {
  const child = spawn(runtime, ['.output/server/index.mjs'], {
    cwd,
    env: { ...process.env, PORT: '0' },
  });
  let output = '';
  const port = new Promise<number>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      output += chunk;
      const match = /Listening on \S+:(\d+)/.exec(output);
      if (match) resolve(Number(match[1]));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => reject(new Error(`exited with ${code}\n${output}`)));
  });

  return { port, stop: () => child.kill() };
}

const cases: Array<[string, string[], string, string]> = [
  ['npm', ['install', '--no-audit', '--no-fund'], 'node', 'node-server'],
];
if (hasBun) cases.push(['bun', ['install'], 'bun', 'bun']);
else console.warn('bun is not on PATH, skipping the bun install case');

describe.each(cases)(
  'a Nitro app installed with %s',
  (packageManager, installArgs, runtime, preset) => {
    let server: ReturnType<typeof start>;
    let base: string;

    beforeAll(async () => {
      const dir = createProject(packageManager);
      run(packageManager, installArgs, dir);
      run(process.execPath, ['node_modules/nitropack/dist/cli/index.mjs', 'build'], dir, {
        NITRO_PRESET: preset,
      });
      server = start(runtime, dir);
      base = `http://127.0.0.1:${await server.port}`;
    });

    afterAll(() => server?.stop());

    it("keeps Nitro's own h3 auto-imports working", async () => {
      const res = await fetch(`${base}/middleware`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('host h3');
    });

    it('serves the dashboard and its API', async () => {
      const page = await fetch(`${base}/ui`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain('<base href="/ui/"');

      const queues = await fetch(`${base}/ui/api/queues`);
      expect(queues.status).toBe(200);
      expect(await queues.json()).toMatchObject({ queues: [] });
    });
  }
);
