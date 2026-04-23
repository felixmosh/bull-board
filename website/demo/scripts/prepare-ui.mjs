import {
  copyFileSync,
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoRoot = resolve(__dirname, '..');
const repoRoot = resolve(demoRoot, '..', '..');
const uiDistStatic = resolve(repoRoot, 'packages/ui/dist/static');
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
console.warn(`[demo] Copied UI static assets into ${demoPublicStatic}`);

// Scan the top-level js/ and css/ for entry bundle tags.
// Async chunks live in js/async and css/async and are loaded dynamically by the UI.
const jsDir = join(demoPublicStatic, 'js');
const cssDir = join(demoPublicStatic, 'css');

const topLevel = (dir, ext) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(ext))
        .map((e) => e.name)
        .sort()
    : [];

const jsEntries = topLevel(jsDir, '.js');
const cssEntries = topLevel(cssDir, '.css');

if (jsEntries.length === 0) {
  throw new Error(`No entry JS files found in ${jsDir}`);
}

// Order matters: the original EJS emits in this precedence (lib-* first, then chunks, then main).
// Reproduce that ordering heuristically: anything starting with "lib-" first, "main" last, rest in between.
const orderKey = (name) => {
  if (name.startsWith('lib-react')) return 0;
  if (name.startsWith('lib-router')) return 1;
  if (name.startsWith('lib-axios')) return 2;
  if (name.startsWith('lib-')) return 3;
  if (name.startsWith('main')) return 9;
  return 5;
};
jsEntries.sort((a, b) => orderKey(a) - orderKey(b) || a.localeCompare(b));

const scriptUrls = jsEntries.map((f) => `static/js/${f}`);
const cssUrls = cssEntries.map((f) => `static/css/${f}`);

const template = readFileSync(resolve(demoRoot, 'index.html.template'), 'utf8');
const styleTags = cssUrls
  .map((href) => `<link rel="stylesheet" href="${href}">`)
  .join('\n    ');
const scriptsJson = JSON.stringify(scriptUrls);

const html = template
  .replace('{{STATIC_STYLES}}', styleTags)
  .replace('{{STATIC_SCRIPTS_JSON}}', scriptsJson);

writeFileSync(resolve(demoRoot, 'index.html'), html);
console.warn(
  `[demo] Wrote index.html with ${jsEntries.length} entry scripts and ${cssEntries.length} stylesheets`
);

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
