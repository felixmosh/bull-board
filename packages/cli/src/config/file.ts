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

// tsc compiles a bare `import()` down to `require()` under module: CommonJS, which cannot
// load an ESM config file. Hiding it behind `new Function` keeps a real dynamic import in
// the emitted JavaScript.
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<{ default?: unknown }>;

export async function loadConfigFile({
  cwd,
  explicitPath,
}: {
  cwd: string;
  explicitPath?: string;
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

  const loaded = await dynamicImport(pathToFileURL(path).href);
  const config = (loaded.default ?? loaded) as FileConfig;

  if (typeof config !== 'object' || config === null) {
    throw new Error(`Config file ${path} must export an object.`);
  }

  return config;
}
