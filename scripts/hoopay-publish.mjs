#!/usr/bin/env node
/**
 * Publishes the HooPay fork of bull-board to GitHub Packages under the @hoopay scope.
 *
 * The @bull-board scope on npm belongs to upstream, so each package is staged under a new name
 * (@bull-board/api -> @hoopay/bull-board-api) and its dependencies on sibling packages become npm
 * aliases ("@bull-board/api": "npm:@hoopay/bull-board-api@<version>"). An alias installs under the
 * original path, node_modules/@bull-board/api, so every require('@bull-board/...') in the code and
 * in consuming apps keeps resolving without changes.
 *
 * The repo's own package.json files are never touched: packages are copied into a staging folder
 * and rewritten there, which keeps merges from upstream conflict free.
 *
 * Usage (after `yarn build`):
 *   node scripts/hoopay-publish.mjs <version>          publish to GitHub Packages
 *   node scripts/hoopay-publish.mjs <version> --pack   write .tgz files to .hoopay-publish/ only
 *   node scripts/hoopay-publish.mjs <version> --dry-run
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = path.join(ROOT, '.hoopay-publish');
const SCOPE = '@hoopay';
const REGISTRY = 'https://npm.pkg.github.com';
const REPOSITORY = 'git+https://github.com/HooPay/bull-board.git';

/** Published in this order so a dependency is always there before its dependents. */
const PACKAGES = ['api', 'ui', 'express'];

const publishedName = (pkg) => `${SCOPE}/bull-board-${pkg}`;

const [version, ...flags] = process.argv.slice(2);
const pack = flags.includes('--pack');
const dryRun = flags.includes('--dry-run');

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: node scripts/hoopay-publish.mjs <version> [--pack | --dry-run]');
  console.error('Example: node scripts/hoopay-publish.mjs 9.10.5-hoopay.1');
  process.exit(1);
}

const aliases = Object.fromEntries(
  PACKAGES.map((pkg) => [`@bull-board/${pkg}`, `npm:${publishedName(pkg)}@${version}`])
);

function rewriteDependencies(deps = {}) {
  return Object.fromEntries(
    Object.entries(deps).map(([name, spec]) => {
      if (aliases[name]) {
        return [name, aliases[name]];
      }
      if (name.startsWith('@bull-board/')) {
        throw new Error(`${name} is not published by this script but is a dependency.`);
      }
      return [name, spec];
    })
  );
}

function stage(pkg) {
  const source = path.join(ROOT, 'packages', pkg);
  const target = path.join(STAGING, pkg);

  if (!fs.existsSync(path.join(source, 'dist'))) {
    throw new Error(`packages/${pkg}/dist is missing. Run \`yarn build\` first.`);
  }

  fs.cpSync(source, target, {
    recursive: true,
    filter: (file) => !file.split(path.sep).includes('node_modules'),
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const staged = {
    ...manifest,
    name: publishedName(pkg),
    version,
    repository: { ...manifest.repository, url: REPOSITORY },
    publishConfig: { registry: REGISTRY },
    dependencies: rewriteDependencies(manifest.dependencies),
    peerDependencies: rewriteDependencies(manifest.peerDependencies),
  };
  // Workspace-only: devDependencies can carry `workspace:` specs and the scripts run yarn hooks.
  delete staged.devDependencies;
  delete staged.scripts;
  for (const key of ['dependencies', 'peerDependencies']) {
    if (Object.keys(staged[key]).length === 0) {
      delete staged[key];
    }
  }

  fs.writeFileSync(path.join(target, 'package.json'), `${JSON.stringify(staged, null, 2)}\n`);
  for (const file of ['LICENSE', 'README.md']) {
    const fromRoot = path.join(ROOT, file);
    if (!fs.existsSync(path.join(target, file)) && fs.existsSync(fromRoot)) {
      fs.copyFileSync(fromRoot, path.join(target, file));
    }
  }
  return target;
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args, cwd) =>
  execFileSync(npm, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });

fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

for (const pkg of PACKAGES) {
  const dir = stage(pkg);
  console.log(`\n${publishedName(pkg)}@${version}`);
  if (pack) {
    run(['pack', '--ignore-scripts', '--pack-destination', STAGING], dir);
  } else {
    run(['publish', '--ignore-scripts', ...(dryRun ? ['--dry-run'] : [])], dir);
  }
}
