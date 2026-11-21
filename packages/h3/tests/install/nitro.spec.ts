import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const appDir = mkdtempSync(path.join(os.tmpdir(), 'bull-board-nitro-'));
let server: ChildProcess;
let base: string;

beforeAll(async () => {
  cpSync(path.join(__dirname, 'nitro-app'), appDir, { recursive: true });

  const tarballs = Object.fromEntries(
    ['api', 'ui', 'h3'].map((name) => {
      const tarball = path.join(appDir, `${name}.tgz`);
      execFileSync('yarn', ['workspace', `@bull-board/${name}`, 'pack', '--out', tarball], {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      return [`@bull-board/${name}`, `file:${tarball}`];
    })
  );
  writeFileSync(
    path.join(appDir, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: { nitropack: '^2.13.6', ...tarballs },
      overrides: tarballs,
    })
  );

  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: appDir, stdio: 'pipe' });
  execFileSync(process.execPath, ['node_modules/nitropack/dist/cli/index.mjs', 'build'], {
    cwd: appDir,
    stdio: 'pipe',
  });

  server = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: appDir,
    env: { ...process.env, PORT: '0' },
  });
  let output = '';
  const port = await new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      output += chunk;
      const match = /Listening on \S+:(\d+)/.exec(output);
      if (match) resolve(match[1]);
    };
    server.stdout?.on('data', onData);
    server.stderr?.on('data', onData);
    server.on('exit', (code) => reject(new Error(`Nitro exited with ${code}\n${output}`)));
  });
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  server?.kill();
  rmSync(appDir, { recursive: true, force: true });
});

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
