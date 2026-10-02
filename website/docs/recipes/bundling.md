# Bundling

`@bull-board/ui` ships the dashboard as files on disk: an EJS template plus the JavaScript, CSS, images and locale files it loads. The server adapters read those files at runtime, and no bundler copies them into its output, so a bundled app has to make them available at runtime in one of the two ways below.

## Keep bull-board external

Marking the `@bull-board/*` packages as external makes the bundle load them from `node_modules` at runtime. bull-board then finds the UI next to its own install, and nothing else needs configuring. This is the setup with the fewest moving parts.

| Bundler | Setting |
|---|---|
| rolldown | `external: [/^@bull-board\//]` |
| esbuild | `'--external:@bull-board/*'` (quoted, so the shell does not expand it) |
| Next.js | see the [Next.js & Vercel recipe](/recipes/nextjs) |

## Bundle bull-board

Bundling bull-board itself works with rolldown, esbuild, webpack, rollup and `bun build`, with both CommonJS and ESM output. The repository's `packages/bundling-tests` workspace builds a dashboard with each of them on every CI run and checks that the bundle serves the page and its static assets.

A bundled bull-board looks for `@bull-board/ui` from three starting points in order: the directory its own code runs from, which in a bundle is usually the bundle's directory, then the directory of the entry script, then the working directory. From each one it walks up through every `node_modules` on the way to the filesystem root. Shipping the bundle together with a `node_modules` that contains `@bull-board/ui` is therefore enough.

Under pnpm, list `@bull-board/ui` as a direct dependency of your app. pnpm only links an app's own dependencies into its `node_modules`, so without that entry the package is installed but cannot be found from the bundle.

If the deployment carries no `node_modules` at all, copy the UI next to the bundle and pass the directory that contains `dist` as `options.uiBasePath`:

```bash
mkdir -p dist/bull-board-ui
cp -r node_modules/@bull-board/ui/dist dist/bull-board-ui/dist
```

```ts
import path from 'node:path';

createBullBoard({
  queues,
  serverAdapter,
  options: { uiBasePath: path.join(import.meta.dirname, 'bull-board-ui') },
});
```

When none of these locations has the UI, `createBullBoard` throws at startup with `@bull-board/api could not find @bull-board/ui`, followed by the directories it searched.

### esbuild with ESM output

esbuild leaves `require()` calls to Node built-in modules untouched in ESM output, so any CommonJS dependency, bull-board and Express included, fails with `Dynamic require of "path" is not supported`. Define `require` in a banner:

```bash
esbuild server.ts --bundle --platform=node --format=esm \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
```
