import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Format = 'esm' | 'cjs';

const fixturesDir = path.resolve(__dirname, '..', 'fixtures');
const outDir = path.resolve(__dirname, '..', 'dist');
const uiPackageDir = path.dirname(require.resolve('@bull-board/ui/package.json'));
const hasBun = spawnSync('bun', ['--version']).status === 0;

if (!hasBun && process.env.CI) {
  throw new Error('bun is not on PATH; CI must install it so the bun build cases run');
}

function build(bundler: string, format: Format): string {
  const extension = format === 'esm' ? 'mjs' : 'cjs';
  const entry = path.join(fixturesDir, `server.${extension}`);
  const outfile = path.join(outDir, `${bundler}-${format}`, `server.${extension}`);
  execFileSync(
    process.execPath,
    [path.join(fixturesDir, 'build.mjs'), bundler, format, entry, outfile],
    {
      stdio: 'pipe',
    }
  );
  return outfile;
}

function start(bundle: string, env: Record<string, string> = {}) {
  const child = spawn(process.execPath, [bundle], {
    cwd: os.tmpdir(),
    env: { ...process.env, ...env },
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));

  const port = new Promise<number>((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      const match = /LISTENING (\d+)/.exec(String(chunk));
      if (match) resolve(Number(match[1]));
    });
    child.on('exit', (code) => reject(new Error(`exited with ${code}\n${stderr}`)));
  });

  return { port, stop: () => child.kill() };
}

async function expectDashboard(bundle: string, env?: Record<string, string>) {
  const server = start(bundle, env);
  try {
    const base = `http://127.0.0.1:${await server.port}/ui`;

    const page = await fetch(`${base}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<base href="/ui/"');

    const asset = await fetch(`${base}/static/favicon-32x32.png`);
    expect(asset.status).toBe(200);
  } finally {
    server.stop();
  }
}

const bundlers: Array<[string, Format]> = [
  ['rolldown', 'esm'],
  ['rolldown', 'cjs'],
  ['esbuild', 'esm'],
  ['esbuild', 'cjs'],
  ['webpack', 'esm'],
  ['webpack', 'cjs'],
  ['rollup', 'esm'],
  ['rollup', 'cjs'],
];

describe.each(bundlers)('%s, %s output', (bundler, format) => {
  it('serves the dashboard and its static assets', async () => {
    await expectDashboard(build(bundler, format));
  });
});

if (!hasBun) {
  console.warn('bun is not on PATH, skipping the bun build cases');
}

(hasBun ? describe.each : describe.skip.each)([['esm'], ['cjs']] as Array<[Format]>)(
  'bun, %s output',
  (format) => {
    it('serves the dashboard and its static assets', async () => {
      await expectDashboard(build('bun', format));
    });
  }
);

describe('a bundle deployed without node_modules', () => {
  let deployDir: string;
  let bundle: string;

  beforeAll(() => {
    deployDir = mkdtempSync(path.join(os.tmpdir(), 'bull-board-bundle-'));
    bundle = path.join(deployDir, 'server.mjs');
    copyFileSync(build('rolldown', 'esm'), bundle);
  });

  afterAll(() => rmSync(deployDir, { recursive: true, force: true }));

  it('fails at startup with a message pointing at options.uiBasePath', async () => {
    await expect(start(bundle).port).rejects.toThrow('options.uiBasePath');
  });

  it('serves the dashboard from a copied UI passed as options.uiBasePath', async () => {
    const uiBasePath = path.join(deployDir, 'ui');
    cpSync(path.join(uiPackageDir, 'dist'), path.join(uiBasePath, 'dist'), { recursive: true });

    await expectDashboard(bundle, { BULL_BOARD_UI_BASE_PATH: uiBasePath });
  });
});
