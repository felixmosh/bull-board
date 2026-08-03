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

That compose file also brings up PostgreSQL, which only the BullMQ v6 half of the version
matrix uses (see "BullMQ version matrix"). Everything else ignores it.

After any `package.json` change, run `yarn install` from the repo root.

## Tests

Unit/integration tests live in `packages/api`. Run from that directory (not the repo root) to get proper Babel transforms:

```bash
cd packages/api
yarn test
```

Adapter contract tests cover every server adapter: Express, Fastify, Hono, Koa, Hapi, H3, Elysia, NestJS, and Bun (see "Runtime notes" for the two that need special handling). Run per-workspace, e.g.:

```bash
yarn workspace @bull-board/express test
yarn workspace @bull-board/koa test
# ...one per adapter
```

All adapter tests require Redis. `testTimeout` is set to 30 000 ms in each jest config to accommodate real Redis + server setup in `beforeAll`.

## BullMQ version matrix

`@bull-board/api` declares `bullmq` as `^5.79.2 || ^6.0.0`, and both majors are tested on every
run. `packages/api/jest.config.js` is a `projects` aggregate over three configs:

| Project | Specs | `bullmq` resolves to |
|---|---|---|
| `@bull-board/api` | everything except `tests/bullmq-matrix/` | the plain `bullmq` devDependency |
| `bullmq@5` | `tests/bullmq-matrix/` only | `bullmq-v5` (npm alias) |
| `bullmq@6` | `tests/bullmq-matrix/` only | `bullmq-v6` (npm alias) |

The two version projects remap the bare `bullmq` specifier with `moduleNameMapper`, the same
trick the Express adapter uses for its express@4/express@5 matrix. Subpaths are remapped too, so
`helpers.ts` can read the resolved major out of `bullmq/package.json`; `assertResolvedMajor()`
fails the suite if a mapping ever stops applying, which is what stops the matrix from silently
running one major twice.

v6 differs from v5 in three ways that matter here, all of them covered by the matrix:

- `Queue#client` is gone. Raw Redis access moved to `queue.getBackend().client`, and only the
  Redis backend has one. `BullMQAdapter` probes for `getBackend` rather than sniffing a version.
- The `paused` job state is gone. A paused queue's jobs are stored as `waiting`, so the adapter
  stops advertising `paused` and the UI tab disappears.
- Queues can be backed by PostgreSQL, where there is no Redis client at all. `getRedisInfo()`
  and `getClient()` resolve `null`, Redis stats answer `404 ERRORS.REDIS_STATS_UNAVAILABLE`, and
  the flow tab renders empty rather than throwing.

The PostgreSQL cases need `POSTGRES_URL` and skip, loudly, without it:

```bash
POSTGRES_URL=postgres://bullmq:bullmq@localhost:5432/bullmq yarn workspace @bull-board/api test
```

Types are gated separately, because a peer major breaks types before it breaks runtime:

```bash
yarn workspace @bull-board/api typecheck:bullmq   # needs `yarn build` first
```

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

Formatting is oxfmt: `yarn format` (`yarn format:check` in CI).

## API errors are translation keys, never English

Maintainer requirement (review on PR #1284): the API must not put user facing English in a response. Every error body is built by `errorResponse()` in `packages/api/src/errors.ts` and carries a translation key the client renders:

```ts
errorResponse(404, 'ERRORS.QUEUE_NOT_FOUND');
errorResponse(400, { key: 'ERRORS.STATUS_NOT_RETRIABLE', options: { status: queueStatus } });
errorResponse(409, 'ERRORS.JOB_IS_ACTIVE', {
  message: { key: 'ERRORS.JOB_IS_ACTIVE_DETAILS', options: { jobId } },
});
```

The body is `ErrorResponseBody` (`packages/api/typings/app.d.ts`):

- `error` is the headline and is **always** a `TranslatableMessage` (`{ key, options? }`), so English cannot be hardcoded there.
- `message` is the optional detail and is `string | TranslatableMessage`. The plain string is the escape hatch for text that only exists at runtime, such as the message of a thrown error in `handlers/error.ts`. That is the only place using it.
- `code` stays a plain machine identifier for clients that branch on a failure instead of displaying it (`CLIENT_HANDLED_ERROR_CODES` in the UI's `Api.ts`).

The UI renders both fields through `translateMessage()` (`packages/ui/src/utils/translateMessage.ts`), which resolves keys against i18next and passes strings through untouched.

### Adding a new API error

1. Add the key to the `ErrorTranslationKey` union in `packages/api/typings/app.d.ts`.
2. Add the same key to `packages/ui/src/static/locales/en-US/messages.json` under `ERRORS`.
3. Translate it in the other ten locale files (they are really translated, not English copies). `yarn workspace @bull-board/ui sync:locales` fills gaps, but the fill is English, so translate before committing.
4. Return it with `errorResponse()`.

Skipping step 2 fails the UI type check: `translateMessage` widens the key to i18next's `ParseKeys`, which is typed against en-US, and the error names the missing key. Skipping step 3 fails `packages/ui/tests/i18n.spec.ts`, which re-runs the locale sync and asserts it produces no changes.

API tests assert the whole descriptor, e.g. `expect(body.error).toEqual({ key: 'ERRORS.QUEUE_NOT_PAUSED' })`, so a reworded locale string never breaks a test.

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

**Caller-injected framework -- `describe.each`** (illustrative). When the test creates the framework instance, install npm-aliased majors and loop over them:

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

```json
"fastify-v4": "npm:fastify@^4",
"fastify-v5": "npm:fastify@^5"
```

No adapter currently uses this pattern: the Fastify adapter is version-locked to fastify@5 (see "Fastify version-lock note" below), so its spec just imports bare `fastify`. The pattern is documented here for any future caller-injected adapter.

**Adapter-internal framework -- jest `moduleNameMapper` projects** (Express -- the live version matrix in this repo, where the adapter constructs Express internally):

`jest.config.js` aggregates two per-version configs via `projects`:

```js
module.exports = { projects: ['<rootDir>/jest.config.v4.js', '<rootDir>/jest.config.v5.js'] };
```

Each per-version config remaps the bare `express` import:

```js
const base = require('./jest.base.js');
module.exports = { ...base, displayName: 'express@4', moduleNameMapper: { '^express$': 'express-v4' } };
```

### Runtime notes (adapters that need special handling)

- **`packages/bun`** runs under Bun's native runtime, so its suite runs via `bun test` (not Jest) and lives in a dedicated CI job. The contract kit is Jest-compatible under `bun test` (`describe`/`it`/`expect`), so the spec reuses it unchanged. Bun is excluded from the Node `yarn test` foreach because its `test` script invokes `bun test`, which the Node runner can't execute.
- **`packages/nestjs`** is a NestJS module that wraps an underlying server adapter (Express or Fastify) rather than implementing the HTTP layer itself. Its spec boots a real Nest application, resolves the board instance from the container after `init()`, and injects the seeded queue via `addQueue()` — the `makeHarness` shim wraps that bootstrap instead of constructing the adapter directly.

### Fastify version-lock note

The `@bull-board/fastify` adapter bundles `@fastify/static@9` and `@fastify/view@11` as runtime dependencies. Both target `fastify@5`. Registering the adapter under `fastify@4` throws a version mismatch error from `fastify-plugin`. The contract suite therefore covers fastify@5 only. The caller-injected `describe.each` matrix pattern is demonstrated on Express instead.
