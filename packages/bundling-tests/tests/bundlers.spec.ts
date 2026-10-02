import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  rmSync,
} from 'node:fs';
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

// Bun hard-errors on a dangling node_modules symlink where esbuild/webpack/rollup silently
// fall back to a hoisted copy, so a stale install tree surfaces only in the bun cases as an
// opaque "File not found" from deep inside a resolver. Detect the dangling links up front.
//
// Checking that a dependency resolves is not enough: Node (like the other bundlers) walks past
// a dangling symlink to a hoisted copy and succeeds. The symlink itself has to be inspected.
function assertNoDanglingSymlinks(dir: string): string[] {
  const dangling: string[] = [];

  const visit = (current: string, depth: number) => {
    if (depth > 3) return;

    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return; // directory does not exist — nothing to check
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);

      if (entry.isSymbolicLink()) {
        // existsSync follows the link, so false means the target is gone.
        if (!existsSync(entryPath)) {
          dangling.push(`${entryPath} -> ${readlinkSync(entryPath)}`);
        }
        continue;
      }

      if (entry.isDirectory()) visit(entryPath, depth + 1);
    }
  };

  visit(dir, 0);
  return dangling;
}

const danglingLinks = assertNoDanglingSymlinks(
  path.resolve(__dirname, '..', '..', 'express', 'node_modules')
);

if (danglingLinks.length) {
  throw new Error(
    `Dangling symlinks in packages/express/node_modules — the install tree is corrupt.\n` +
      danglingLinks.map((link) => `  ${link}`).join('\n') +
      '\n\nA stale package manager left these behind. Bun fails to resolve them; esbuild/webpack/rollup ' +
      'silently fall back to hoisted copies, which is why only the bun cases break.\n' +
      'Run: rm -rf node_modules packages/*/node_modules && yarn install'
  );
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
