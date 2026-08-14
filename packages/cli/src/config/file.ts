import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FileConfig } from './types';

const CANDIDATES = [
  'bull-board.config.mjs',
  'bull-board.config.js',
  'bull-board.config.cjs',
  'bull-board.config.json',
];

export type ImportModule = (specifier: string) => Promise<{ default?: unknown }>;

// tsc compiles a bare `import()` down to `require()` under module: CommonJS, which cannot
// load an ESM config file. Hiding it behind `new Function` keeps a real dynamic import in
// the emitted JavaScript.
const dynamicImport = new Function('specifier', 'return import(specifier)') as ImportModule;

export async function loadConfigFile({
  cwd,
  explicitPath,
  importModule = dynamicImport,
}: {
  cwd: string;
  explicitPath?: string;
  importModule?: ImportModule;
}): Promise<FileConfig> {
  const path = explicitPath
    ? isAbsolute(explicitPath)
      ? explicitPath
      : resolve(cwd, explicitPath)
    : CANDIDATES.map((name) => join(cwd, name)).find((candidate) => existsSync(candidate));

  if (!path) {
    return {};
  }

  if (explicitPath && !existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }

  if (path.endsWith('.json')) {
    return JSON.parse(readFileSync(path, 'utf8')) as FileConfig;
  }

  const loaded = await loadModule(path, importModule);
  const config = (loaded.default ?? loaded) as FileConfig;

  if (typeof config !== 'object' || config === null) {
    throw new Error(`Config file ${path} must export an object.`);
  }

  return config;
}

/**
 * `.mjs` is always ESM and needs a real dynamic import. `.js` and `.cjs` are CommonJS in
 * the common case, and `require` reads them in every context, including test sandboxes
 * that cannot run a dynamic import. A `.js` file in a `"type": "module"` project is ESM
 * even so, which is what the fallback is for.
 */
async function loadModule(
  path: string,
  importModule: ImportModule
): Promise<{ default?: unknown }> {
  const url = pathToFileURL(path).href;

  if (path.endsWith('.mjs')) {
    return importModule(url);
  }

  try {
    return require(path) as { default?: unknown };
  } catch {
    return importModule(url);
  }
}
