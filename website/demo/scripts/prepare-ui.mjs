import { copyFileSync, cpSync, existsSync, rmSync, } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoRoot = resolve(__dirname, '..');
const repoRoot = resolve(demoRoot, '..', '..');
const uiDist = resolve(repoRoot, 'packages/ui/dist');
const uiDistStatic = resolve(uiDist, 'static');
const demoPublicStatic = resolve(demoRoot, 'public/static');

if (!existsSync(uiDistStatic)) {
  console.warn('[demo] @bull-board/ui dist not found, building...');
  execSync('yarn workspace @bull-board/ui build', {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

if (!existsSync(uiDistStatic)) {
  throw new Error(`UI build did not produce ${uiDistStatic}`);
}

if (existsSync(demoPublicStatic)) {
  rmSync(demoPublicStatic, { recursive: true });
}
cpSync(uiDistStatic, demoPublicStatic, { recursive: true });
cpSync(join(uiDist, 'index.ejs'), 'index.ejs');
console.warn(`[demo] Copied UI static assets into ${demoPublicStatic}`);

// Bundle the project logo and favicon inside the demo so it renders even when
// served standalone (outside the docs site). See index.html.template for refs.
const logoSrc = resolve(repoRoot, 'packages/ui/src/static/images/logo.svg');
const logoDest = resolve(demoRoot, 'public/logo.svg');
if (existsSync(logoSrc)) {
  copyFileSync(logoSrc, logoDest);
  console.warn(`[demo] Copied project logo to ${logoDest}`);
}

const faviconSrc = resolve(repoRoot, 'packages/ui/src/static/favicon.ico');
const faviconDest = resolve(demoRoot, 'public/favicon.ico');
if (existsSync(faviconSrc)) {
  copyFileSync(faviconSrc, faviconDest);
  console.warn(`[demo] Copied favicon to ${faviconDest}`);
}
