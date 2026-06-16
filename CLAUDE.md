# bull-board

## Monorepo layout

Yarn 4 workspaces under `packages/*`. Key packages:

| Package | Description |
|---|---|
| `api` | Core library -- BullMQ/Bull adapters, queue handlers, server-adapter base |
| `ui` | React UI, built to `dist/` |
| `express`, `fastify`, `hono`, `koa`, `h3`, `hapi`, `nestjs`, `elysia`, `bun` | Server adapters |
| `test-utils` | Private (unpublished) in-repo test kit for adapter contract tests |

## Dev prerequisites

Redis must be running locally before running tests or the dev server:

```bash
docker compose -f docker-compose.redis.yml up -d
```

After any `package.json` change, run `yarn install` from the repo root.

## Tests

Unit/integration tests live in `packages/api`. Run from that directory (not the repo root) to get proper Babel transforms:

```bash
cd packages/api
yarn test
```

Adapter contract tests live in `packages/express`, `packages/fastify`, and `packages/hono` (see below). Run per-workspace:

```bash
yarn workspace @bull-board/express test
yarn workspace @bull-board/fastify test
yarn workspace @bull-board/hono test
```

All adapter tests require Redis. `testTimeout` is set to 30 000 ms in each jest config to accommodate real Redis + server setup in `beforeAll`.

## Build

```bash
yarn build
```

The `dist/` folder matters: `packages/api` tests and server adapters resolve `@bull-board/api` from its `dist/`. Rebuild after changing source. The Fastify adapter has a pre-existing TypeScript error in its build; build specific workspaces instead if the root build fails.

## Linting

oxlint (not ESLint/Prettier):

```bash
npx oxlint './packages/**/*.{ts,tsx}' . --fix
```

## Adapter contract tests

### Overview

`packages/test-utils` is a private in-repo workspace (`@bull-board/test-utils`) that exports a parametrized contract battery. Each adapter package carries a thin `tests/contract.spec.ts` that adapts the adapter's native request mechanism to the normalized shape the contract expects.

The contract battery (`runServerAdapterContract`) runs 8 test cases split across two `describe` blocks:

**Mounted at root (`basePath = ""`)**
1. Serves the entry HTML with injected `basePath` + `uiConfig` markers
2. Serves static assets (`/static/test-asset.txt`)
3. `GET /api/queues` returns the seeded queue as JSON
4. `POST /api/queues/:name/add` parses the body and adds a job
5. `PUT /api/queues/:name/pause` returns 2xx and pauses the queue
6. Returns a structured 4xx error for an unknown queue

**Mounted under `/ui` (`basePath = "/ui"`)**
7. `GET /ui/api/queues` resolves under the prefix
8. Entry HTML contains `<base href="/ui/">`

The battery uses a real Redis connection (via `seedQueue` from `src/redisFixtures.ts`) and a minimal fixture UI (`src/uiFixture/dist/`) instead of the production UI.

### Covering a new adapter

1. Add devDependencies to the adapter's `package.json`: `@bull-board/test-utils`, `jest`, `ts-jest`. Add a `"test": "jest"` script.

2. Create `jest.config.js`:

```js
const pkg = require('./package.json');
const { defaults: tsJest } = require('ts-jest/presets');
module.exports = {
  displayName: pkg.name,
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: { ...tsJest.transform },
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testTimeout: 30000,
};
```

3. Create `tests/contract.spec.ts`. Implement the `makeHarness` shim: spin up the adapter, return a normalized `request` function and a `teardown`:

```ts
import { runServerAdapterContract, uiFixtureBasePath } from '@bull-board/test-utils';
import { createBullBoard } from '@bull-board/api';
import { MyAdapter } from '../src';

runServerAdapterContract('MyAdapter', async ({ basePath, queue }) => {
  const serverAdapter = new MyAdapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({ queues: [queue.adapter], serverAdapter, options: { uiBasePath: uiFixtureBasePath } });

  // ... mount the adapter, build a request function ...

  return {
    request: async (req) => ({ status, headers, text }),
    teardown: async () => { /* close server/app */ },
  };
});
```

The `request` function receives `{ method, path, body? }` and must return `{ status: number, headers: Record<string, string|string[]>, text: string }`. See the three existing specs for the exact pattern per framework type.

4. Run `yarn install && yarn workspace @bull-board/<name> test`.

### Framework-version matrix

Two patterns are used depending on whether the caller or the adapter controls the framework instance:

**Caller-injected framework -- `describe.each`** (example: Fastify v4/v5 in the plan; currently Fastify only covers v5 due to version-locked plugins):

```ts
describe.each([
  ['fastify@4', require('fastify-v4').default],
  ['fastify@5', require('fastify-v5').default],
])('%s', (_label, Fastify) => {
  runServerAdapterContract('Fastify', async ({ basePath, queue }) => {
    const app = Fastify();
    // ...
  });
});
```

Install framework aliases in `package.json` devDependencies:

```json
"fastify-v4": "npm:fastify@^4",
"fastify-v5": "npm:fastify@^5"
```

**Adapter-internal framework -- jest `moduleNameMapper` projects** (example: Express, where the adapter constructs Express internally):

`jest.config.js` aggregates two per-version configs via `projects`:

```js
module.exports = { projects: ['<rootDir>/jest.config.v4.js', '<rootDir>/jest.config.v5.js'] };
```

Each per-version config remaps the bare `express` import:

```js
const base = require('./jest.base.js');
module.exports = { ...base, displayName: 'express@4', moduleNameMapper: { '^express$': 'express-v4' } };
```

### Bun adapter exception

The `packages/bun` adapter runs under Bun's native runtime and requires `bun test` instead of Jest. The `@bull-board/test-utils` contract kit is not wired to the Bun adapter yet. This is a known gap, deferred from the initial implementation.

### Fastify version-lock note

The `@bull-board/fastify` adapter bundles `@fastify/static@9` and `@fastify/view@11` as runtime dependencies. Both target `fastify@5`. Registering the adapter under `fastify@4` throws a version mismatch error from `fastify-plugin`. The contract suite therefore covers fastify@5 only. The caller-injected `describe.each` matrix pattern is demonstrated on Express instead.
