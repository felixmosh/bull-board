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

`@bull-board/api` declares `bullmq` as `^5.56.0 || ^6.0.0`. Both majors and the exact lower bound
are tested on every run. `yarn workspace @bull-board/api test` is two `jest` invocations:
`jest.config.js`, a `projects` aggregate over three configs, followed by
`jest.config.bullmq-floor.js` on its own.

| Config | Specs | `bullmq` resolves to |
|---|---|---|
| `jest.config.default.js` | everything except `tests/bullmq-matrix/` | the plain `bullmq` devDependency |
| `jest.config.bullmq-v5.js` | `tests/bullmq-matrix/` only | `bullmq-v5` (npm alias, latest 5.x) |
| `jest.config.bullmq-v6.js` | `tests/bullmq-matrix/` only | `bullmq-v6` (npm alias, latest 6.x) |
| `jest.config.bullmq-floor.js` | everything except `tests/bullmq-matrix/` | `bullmq-v5-floor` (npm alias, pinned to 5.56.0) |

The version configs remap the bare `bullmq` specifier with `moduleNameMapper`, the same trick the
Express adapter uses for its express@4/express@5 matrix. Subpaths are remapped too, so
`helpers.ts` can read the resolved major out of `bullmq/package.json`; `assertResolvedMajor()`
fails the suite if a mapping ever stops applying, which is what stops the matrix from silently
running one major twice.

The floor config replays the default project's specs, so it cannot be a fourth entry in
`projects`: two projects driving the same queue names against one Redis race each other. It also
throws at load if `bullmq-v5-floor` and the first term of the peer range disagree, so the declared
lower bound cannot drift away from the version that proves it.

The floor is set by what CI can prove, not by whatever the devDependency happened to be. Moving it
down means finding the lowest version the suite passes on and widening the peer range to match;
moving it up is a breaking change. As of 5.56.0 the blockers below are BullMQ storing scheduler
`every` as a string, `upsertJobScheduler` leaving a stale `every` behind when a schedule switches
to a cron pattern, and `Queue#removeGlobalConcurrency` not existing before 5.41.

v6 differs from v5 in three ways that matter here, all of them covered by the matrix:

- `Queue#client` is gone. Raw Redis access moved to `queue.getBackend().client`, and only the
  Redis backend has one. `BullMQAdapter` probes for `getBackend` rather than sniffing a version.
- The `paused` job state is gone. A paused queue's jobs are stored as `waiting`, so the adapter
  stops advertising `paused` and the UI tab disappears.
- Queues can be backed by PostgreSQL, where there is no Redis client at all. `getRedisInfo()`
  and `getClient()` resolve `null`, the stats panel reports Postgres datastore stats instead,
  and the flow tree reuses the queue's backend so flows render the same as on Redis.

The PostgreSQL cases need `POSTGRES_URL` and skip, loudly, without it:

```bash
POSTGRES_URL=postgres://bullmq:bullmq@localhost:5432/bullmq yarn workspace @bull-board/api test
```

`packages/metrics` carries a two-project version of the same idea: `jest.config.default.js`
runs everything outside `tests/bullmq-matrix/` against the plain `bullmq` devDependency, and
`jest.config.bullmq-v6.js` runs that directory against `bullmq-v6`. Its PostgreSQL cases read
`POSTGRES_URL` the same way:

```bash
POSTGRES_URL=postgres://bullmq:bullmq@localhost:5432/bullmq yarn workspace @bull-board/metrics test
```

Its specs share one Redis, and several of them assert on state that is global by design: the
`__global__` rollup hash every recorder writes into, and the namespace-wide SCAN that
`MetricsHistoryAdmin` purges with. Unique queue names cannot isolate either, so `tests/connection.ts`
hands each Jest worker its own logical database, derived from `JEST_WORKER_ID` and counting down
from 15 so database 0 stays free for a developer's dev board. Any new spec in this package must
take its connection from that module rather than build its own. `maxWorkers` in `jest.base.js`
caps the worker count to the number of databases available, and `jest.config.js` repeats the cap
because Jest reads global options from the root config only, ignoring them inside a `projects`
entry.

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

### NestJS version matrix

`@bull-board/nestjs` declares `@nestjs/common` and `@nestjs/core` as `^9 || ^10 || ^11 || ^12`.
NestJS 11 and 12 are both exercised on every run. `yarn workspace @bull-board/nestjs test` is two
`jest` invocations over the same two spec files: `jest.config.js` for 11, then
`jest.config.v12.js` for 12.

Both configs take their `moduleNameMapper` from `jest.nest-matrix.js`, which builds the mapping
for `@nestjs/{bull-shared,bullmq,common,core,platform-express}` out of one list of npm aliases
(`nestjs-core-v11`: `npm:@nestjs/core@^11`, and so on). Generating both configs from that single
list is what stops a mapping entry from being dropped and one major from silently being run
twice; the helper also reads each alias's installed version off disk and throws at config load if
it is not the major the project claims to test.

The plain `@nestjs/*` devDependencies stay on 11 and are what `tsc` builds and typechecks
against. Neither config uses them.

NestJS 12 is published as ESM only: no CommonJS build, `"type": "module"` on every package. Jest
cannot `require()` that, so `jest.config.v12.js` is an ESM project, with
`extensionsToTreatAsEsm: ['.ts']`, ts-jest under `useESM` and `module: 'esnext'`, and
`NODE_OPTIONS=--experimental-vm-modules` in front of that second invocation.

That is also why the two majors cannot be a `projects` aggregate in one `jest` run, which is what
this started as. Jest decides whether a path is ESM once per worker process and caches the answer
by path, and a worker serves test files from every project. `packages/test-utils` is loaded by
both majors, so once the 12 project classified `serverAdapterContract.ts` as ESM, the 11 project
running later in the same worker executed its CommonJS output as an ES module and died on
`ReferenceError: exports is not defined`. It only shows up when there are fewer workers than test
files, so it passed on a developer machine and failed on CI; `jest --maxWorkers=2` reproduces it
exactly.

`@bull-board/test-utils` cannot be loaded into the ESM config as it stands, because its barrel
computes `uiFixtureBasePath` from `__dirname`. The v12 config maps `@bull-board/test-utils` to
`tests/esmTestUtils.ts`, which re-exports the two modules of the kit that never touch `__dirname`
and rebuilds the fixture path from `import.meta.url`. The contract battery itself is shared
unchanged between both majors.

The published package stays CommonJS. A Nest 12 app is ESM and reaches it through Node's
CJS-from-ESM interop, which resolves the named exports off `dist/index.js` correctly;
`website/docs/server-adapters/nestjs.md` states that for consumers.
### h3 version matrix

`@bull-board/h3` declares `h3` as `^1.15.11 || ^2.0.0`. `yarn workspace @bull-board/h3 test` is
two `jest` invocations over one spec file: `jest.config.js` maps `h3` to the `h3-v1` alias,
`jest.config.v2.js` maps it to `h3-v2`, pinned to `2.0.1-rc.29`. The RC is what h3 publishes as
`latest`; 1.x sits on the `1x` tag. Because a prerelease does not satisfy `^2.0.0`, installs keep
resolving 1.x until a stable 2.0.0 ships, at which point they move without another release here.

Two things in `H3Adapter` are load-bearing for 2.x and easy to undo by accident:

- Routes are registered as `router[method](path, handler)`, never `router.use(path, handler,
  method)`. Both forms match on 1.x, but the `use` form yields an empty params object on 2.x, so
  every `:queueName` and `:jobId` route silently resolves to nothing and the API answers
  `ERRORS.QUEUE_NOT_FOUND` for real queues while `GET /api/queues` keeps working.
- The entry route sets `content-type: text/html` explicitly. 1.x infers it from the leading `<`;
  2.x does not, and serves the dashboard as `text/plain`, so the browser shows the raw source.

Like NestJS 12, h3 2.x is ESM only, so `jest.config.v2.js` is an ESM project behind
`NODE_OPTIONS=--experimental-vm-modules`.

It also cannot drive the app through `toNodeListener` plus supertest. h3 2.x sends its response
through srvx, which does `res instanceof Promise` (`srvx/dist/adapters/node.mjs`) to decide
whether to await the handler. A promise created inside jest's VM realm fails that check, srvx
treats the promise itself as the body, and every async handler dies on `TypeError:
webRes.headers is not iterable`. This is a jest realm artifact, not an adapter bug: the same code
works against a real `http.createServer`. `tests/contract.spec.ts` therefore probes for
`app.fetch`, which 2.x exposes and 1.x does not, and drives the web-standard entry point when it
is there, falling back to `toNodeListener` plus supertest on 1.x.

### Runtime notes (adapters that need special handling)

- **`packages/bun`** runs under Bun's native runtime, so its suite runs via `bun test` (not Jest) and lives in a dedicated CI job. The contract kit is Jest-compatible under `bun test` (`describe`/`it`/`expect`), so the spec reuses it unchanged. Bun is excluded from the Node `yarn test` foreach because its `test` script invokes `bun test`, which the Node runner can't execute.
- **`packages/nestjs`** is a NestJS module that wraps an underlying server adapter (Express or Fastify) rather than implementing the HTTP layer itself. Its spec boots a real Nest application, resolves the board instance from the container after `init()`, and injects the seeded queue via `addQueue()` — the `makeHarness` shim wraps that bootstrap instead of constructing the adapter directly.

### Fastify version-lock note

The `@bull-board/fastify` adapter bundles `@fastify/static@9` and `@fastify/view@11` as runtime dependencies. Both target `fastify@5`. Registering the adapter under `fastify@4` throws a version mismatch error from `fastify-plugin`. The contract suite therefore covers fastify@5 only. The caller-injected `describe.each` matrix pattern is demonstrated on Express instead.
