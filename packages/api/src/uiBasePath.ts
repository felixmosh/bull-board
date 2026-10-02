import { createRequire } from 'module';
import path from 'path';

const UI_PACKAGE_JSON_HIDDEN_FROM_BUNDLERS = ['@bull-board', 'ui', 'package.json'].join('/');

export function resolveUiBasePath(): string {
  const searchFrom = [
    typeof __dirname === 'string' ? __dirname : undefined,
    process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : undefined,
    process.cwd(),
  ].filter((dir): dir is string => Boolean(dir));

  try {
    const resolver = createRequire(path.join(process.cwd(), 'index.js'));
    return path.dirname(
      resolver.resolve(UI_PACKAGE_JSON_HIDDEN_FROM_BUNDLERS, { paths: searchFrom })
    );
  } catch {
    throw new Error(
      `@bull-board/api could not find @bull-board/ui (searched from ${searchFrom.join(', ')}). ` +
        'Install @bull-board/ui where your app can resolve it at runtime, or pass its directory as options.uiBasePath. ' +
        'See https://felixmosh.github.io/bull-board/recipes/bundling'
    );
  }
}
