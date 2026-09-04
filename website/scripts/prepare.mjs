import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scalarDir = join(root, 'docs', 'public', 'scalar');

const require = createRequire(import.meta.url);
const bundle = join(dirname(require.resolve('@scalar/api-reference')), 'browser', 'standalone.js');

mkdirSync(scalarDir, { recursive: true });
copyFileSync(bundle, join(scalarDir, 'standalone.js'));

// oxlint-disable-next-line no-console
console.log('[docs] Copied the Scalar bundle into docs/public/scalar');
