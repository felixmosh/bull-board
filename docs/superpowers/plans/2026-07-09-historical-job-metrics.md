# Historical Job Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in long-retention (default 90 day) history of completed/failed job counts, per queue and as a cross-queue global rollup, reusing the existing recharts UI, while keeping the core `@bull-board/api` stateless.

**Architecture:** Three pieces. (1) Core gains one optional `historyProvider` seam on `createBullBoard` plus one optional endpoint `GET /api/metrics/history` whose handler is closure-bound to the provider inside `createBullBoard` (no server-adapter changes). (2) A new opt-in package `@bull-board/metrics` runs in the user's process: a `MetricsRecorder` snapshots native BullMQ `getMetrics` into idempotent per-minute Redis buckets (with maintained daily + global rollups via an atomic Lua upsert), and a `RedisMetricsHistoryProvider` reads them back. (3) UI adds a range selector to `QueueMetrics` (60m native, 7d/30d/90d history) and a global overview view, both gated on a `hasHistoryProvider` flag.

**Tech Stack:** TypeScript, BullMQ (`getMetrics`), ioredis, Redis (real, in tests), Jest + ts-jest, React + recharts + @tanstack/react-query, Yarn 4 workspaces.

## Global Constraints

- **Stateless core.** `packages/api` stores nothing and knows nothing about Redis keys or storage. It only defines the `MetricsHistoryProvider` interface, the optional endpoint, and delegates. All storage lives in `@bull-board/metrics`.
- **Opt-in, zero-cost when off.** Users who do not pass `historyProvider` and do not run the recorder see no behavior change and no new endpoint (route returns 404 / is absent).
- **No em-dashes** anywhere authored (code comments, docs, README, PR body, commit messages). Use commas, parentheses, or separate sentences. This is a hard project rule.
- **UTC everywhere** for day/hour bucketing to avoid DST ambiguity. Document it.
- **`getMetrics` data coercion.** BullMQ's `getMetrics().data` is conceptually `number[]` but values originate as Redis strings; always coerce with `Number(...)` before arithmetic.
- **Data to minute mapping (load-bearing, verified against BullMQ `collectMetrics.lua` + `getMetrics-2.lua`):** the metrics `data` list is newest-first. For a `QueueMetrics` result, `data[i]` corresponds to the absolute minute index `Math.floor(prevTS / 60000) - 1 - i` (timestamp `minuteIndex * 60000`). The in-progress current minute is never in `data`, so every point the recorder sees is finalized and immutable, which is what makes idempotent-by-minute writes safe.
- **Idempotency is mandatory, no singleton.** Writes are idempotent by minute so multiple recorder processes and recorder restarts converge instead of double-counting. The compare-and-apply must be atomic (Lua), not read-then-write in JS.
- **Redis required for tests.** Start it with `docker compose -f docker-compose.redis.yml up -d`. Connection: `{ host: process.env.REDIS_HOST || 'localhost', port: +(process.env.REDIS_PORT || 6379) }`. Jest `testTimeout` 30000 for Redis-backed suites.
- **Run `yarn install` from repo root** after any `package.json` change (Yarn 4 workspaces).
- **Rebuild `@bull-board/api` `dist/`** (`yarn workspace @bull-board/api build`) before running tests that resolve `@bull-board/api`, and before running the `@bull-board/metrics` tests (they import the built api).
- **MVP scope:** completed/failed throughput only, per-queue plus global rollup, BullMQ only. Daily and hourly read granularity. No alerting, no depth gauges, no latency percentiles, no Bull legacy. Those are Phase 2.

---

## File Structure

**`packages/api` (core seam, no storage):**
- Modify `typings/app.d.ts` — add `MetricsHistoryGranularity`, `MetricsHistoryQuery`, `MetricsHistoryPoint`, `MetricsHistoryProvider`; add `historyProvider?` to `BoardOptions`; add `hasHistoryProvider?: boolean` to `UIConfig`.
- Modify `typings/responses.d.ts` — add `GetMetricsHistoryResponse`.
- Create `src/handlers/metricsHistory.ts` — `createMetricsHistoryHandler(provider)` factory returning an `AppControllerRoute['handler']`.
- Modify `src/index.ts` — conditionally append the history route (closure-bound to the provider) and set `hasHistoryProvider` in UIConfig.
- Create `tests/api/metrics-history.spec.ts`.

**`packages/metrics` (new package, all storage):**
- Create `package.json`, `tsconfig.json`, `jest.config.js`, `README.md`, `.gitignore`.
- Create `src/keys.ts` — key namespacing + UTC day/minute helpers.
- Create `src/dataMapping.ts` — pure `metricsToMinutePoints(metrics)` mapping.
- Create `src/HistoryStore.ts` — Redis write/read primitives + the atomic Lua upsert.
- Create `src/MetricsRecorder.ts` — the scheduler/snapshotter.
- Create `src/RedisMetricsHistoryProvider.ts` — implements `MetricsHistoryProvider`.
- Create `src/index.ts` — public exports.
- Create `tests/dataMapping.spec.ts`, `tests/HistoryStore.spec.ts`, `tests/MetricsRecorder.spec.ts`, `tests/RedisMetricsHistoryProvider.spec.ts`, `tests/e2e.spec.ts`.

**`packages/ui` (consumes the seam):**
- Modify `src/services/Api.ts` — `getHistoryMetrics(query)`.
- Modify `src/hooks/queryKeys.ts` — `historyMetrics` key.
- Create `src/hooks/useHistoryMetrics.ts`.
- Modify `src/components/QueueMetrics/QueueMetrics.tsx` + `.module.css` — range selector + history rendering.
- Modify `src/pages/OverviewPage/OverviewPage.tsx` (+ a small `GlobalMetrics` component) — cross-queue global view.
- Add i18n keys to the English locale file (and let `sync:locales` propagate).

---

# PHASE 1A: Core read-seam (`packages/api`)

### Task 1: Type definitions for the history seam

**Files:**
- Modify: `packages/api/typings/app.d.ts`
- Modify: `packages/api/typings/responses.d.ts`

**Interfaces:**
- Produces: `MetricsHistoryGranularity`, `MetricsHistoryQuery`, `MetricsHistoryPoint`, `MetricsHistoryProvider` (all from `@bull-board/api/typings/app`); `historyProvider?: MetricsHistoryProvider` on `BoardOptions`; `hasHistoryProvider?: boolean` on `UIConfig`; `GetMetricsHistoryResponse` (from `@bull-board/api/typings/responses`).

- [ ] **Step 1: Add the history types to `app.d.ts`**

In `packages/api/typings/app.d.ts`, directly below the existing `QueueMetrics` interface (currently ending at the line `}` after `count: number;`, around line 19), add:

```ts
export type MetricsHistoryGranularity = 'hour' | 'day';

export interface MetricsHistoryQuery {
  /** Queue name (namespaced, as returned by adapter.getName()). Omit for the cross-queue global rollup. */
  queue?: string;
  metric: MetricsType;
  /** Inclusive lower bound, epoch ms. */
  from: number;
  /** Inclusive upper bound, epoch ms. */
  to: number;
  granularity: MetricsHistoryGranularity;
}

export interface MetricsHistoryPoint {
  /** Bucket start, epoch ms (UTC-aligned to the granularity). */
  ts: number;
  value: number;
}

/**
 * Read-only seam the core uses to serve long-retention metrics history.
 * The concrete implementation lives in the opt-in @bull-board/metrics package.
 * The core never stores anything; it only calls this interface.
 */
export interface MetricsHistoryProvider {
  getHistory(query: MetricsHistoryQuery): Promise<MetricsHistoryPoint[]>;
}
```

- [ ] **Step 2: Extend `BoardOptions` and `UIConfig`**

In the same file, change `BoardOptions` (around line 260) to:

```ts
export type BoardOptions = {
  uiBasePath?: string;
  uiConfig?: UIConfig;
  historyProvider?: MetricsHistoryProvider;
};
```

Inside the `UIConfig = Partial<{ ... }>` block, immediately after `showMetrics?: boolean;`, add:

```ts
  /** Set by createBullBoard when a historyProvider is configured. Enables the history range selector in the UI. */
  hasHistoryProvider?: boolean;
```

- [ ] **Step 3: Add the response envelope to `responses.d.ts`**

In `packages/api/typings/responses.d.ts`, update the import on line 1 to include the new types and add the response interface at the end:

```ts
import {
  AppJob,
  AppQueue,
  MetricsHistoryPoint,
  QueueDefaultJobOptions,
  QueueMetrics,
  Status,
} from './app';
```

```ts
export interface GetMetricsHistoryResponse {
  points: MetricsHistoryPoint[];
}
```

- [ ] **Step 4: Verify it compiles**

Run: `yarn workspace @bull-board/api build`
Expected: builds with no errors (dist regenerated).

- [ ] **Step 5: Commit**

```bash
git add packages/api/typings/app.d.ts packages/api/typings/responses.d.ts
git commit -m "feat(api): add MetricsHistoryProvider seam types"
```

---

### Task 2: History endpoint handler (factory bound to a provider)

**Files:**
- Create: `packages/api/src/handlers/metricsHistory.ts`
- Test: `packages/api/tests/api/metrics-history.spec.ts`

**Interfaces:**
- Consumes: `MetricsHistoryProvider`, `MetricsHistoryQuery`, `MetricsHistoryGranularity` (Task 1); `BullBoardRequest`, `ControllerHandlerReturnType`, `AppControllerRoute` (existing, `../../typings/app`).
- Produces: `createMetricsHistoryHandler(provider: MetricsHistoryProvider): AppControllerRoute['handler']`.

The handler reads `queue, metric, from, to, granularity` from `request.query`, validates them, returns `{ status: 400, body: { error } }` on bad input, otherwise delegates to `provider.getHistory(...)` and returns `{ status: 200, body: { points } }`. It is a factory closing over `provider` so it needs no access to server-adapter state.

- [ ] **Step 1: Write the failing test**

Create `packages/api/tests/api/metrics-history.spec.ts`:

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { MetricsHistoryProvider, MetricsHistoryQuery } from '@bull-board/api/typings/app';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('metrics history endpoint', () => {
  let serverAdapter: ExpressAdapter;
  const queueList: Queue[] = [];

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
    queueList.length = 0;
  });

  afterEach(async () => {
    for (const queue of queueList) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
  });

  function makeQueue(name: string) {
    const queue = new Queue(name, { connection });
    queueList.push(queue);
    return queue;
  }

  it('returns 404 when no historyProvider is configured', async () => {
    const queue = makeQueue('NoHistoryQueue');
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

    await request(serverAdapter.getRouter()).get('/api/metrics/history').expect(404);
  });

  it('delegates to the provider and returns points', async () => {
    const queue = makeQueue('HistoryQueue');
    const captured: MetricsHistoryQuery[] = [];
    const provider: MetricsHistoryProvider = {
      getHistory: async (query) => {
        captured.push(query);
        return [{ ts: 60000, value: 3 }];
      },
    };

    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/history')
      .query({ metric: 'completed', from: '0', to: '120000', granularity: 'day' })
      .expect(200)
      .then((res) => {
        const body = JSON.parse(res.text);
        expect(body.points).toEqual([{ ts: 60000, value: 3 }]);
      });

    expect(captured[0]).toEqual({
      queue: undefined,
      metric: 'completed',
      from: 0,
      to: 120000,
      granularity: 'day',
    });
  });

  it('returns 400 for an invalid metric', async () => {
    const queue = makeQueue('BadMetricQueue');
    const provider: MetricsHistoryProvider = { getHistory: async () => [] };
    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
      options: { historyProvider: provider },
    });

    await request(serverAdapter.getRouter())
      .get('/api/metrics/history')
      .query({ metric: 'bogus', from: '0', to: '1', granularity: 'day' })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn workspace @bull-board/api build && cd packages/api && yarn test -- metrics-history`
Expected: FAIL. The 404 test passes trivially, but the "delegates" test fails because the route does not exist yet (404 instead of 200).

- [ ] **Step 3: Implement the handler factory**

Create `packages/api/src/handlers/metricsHistory.ts`:

```ts
import {
  AppControllerRoute,
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsHistoryGranularity,
  MetricsHistoryProvider,
  MetricsType,
} from '../../typings/app';

const METRICS: MetricsType[] = ['completed', 'failed'];
const GRANULARITIES: MetricsHistoryGranularity[] = ['hour', 'day'];

export function createMetricsHistoryHandler(
  provider: MetricsHistoryProvider
): AppControllerRoute['handler'] {
  return async function metricsHistoryHandler(
    req?: BullBoardRequest
  ): Promise<ControllerHandlerReturnType> {
    const query = req?.query ?? {};
    const metric = query.metric as MetricsType;
    const granularity = (query.granularity as MetricsHistoryGranularity) ?? 'day';
    const from = Number(query.from);
    const to = Number(query.to);
    const queue = typeof query.queue === 'string' && query.queue.length > 0 ? query.queue : undefined;

    if (!METRICS.includes(metric)) {
      return { status: 400, body: { error: `Invalid metric: ${String(metric)}` } };
    }
    if (!GRANULARITIES.includes(granularity)) {
      return { status: 400, body: { error: `Invalid granularity: ${String(granularity)}` } };
    }
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      return { status: 400, body: { error: 'Invalid from/to range' } };
    }

    const points = await provider.getHistory({ queue, metric, from, to, granularity });
    return { status: 200, body: { points } };
  };
}
```

- [ ] **Step 4: Verify still failing for the right reason**

Run: `cd packages/api && yarn test -- metrics-history`
Expected: still FAIL on the "delegates"/"400" tests, because `createBullBoard` does not register the route yet. (Task 3 wires it.) The handler compiles.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/handlers/metricsHistory.ts packages/api/tests/api/metrics-history.spec.ts
git commit -m "feat(api): add metrics history handler factory and tests"
```

---

### Task 3: Wire the seam into `createBullBoard`

**Files:**
- Modify: `packages/api/src/index.ts`

**Interfaces:**
- Consumes: `createMetricsHistoryHandler` (Task 2); `appRoutes` (existing, `./routes`); `BoardOptions.historyProvider`, `UIConfig.hasHistoryProvider` (Task 1).
- Produces: registration of `GET /api/metrics/history` when `options.historyProvider` is set; `hasHistoryProvider: true` in the UIConfig sent to the browser.

- [ ] **Step 1: Modify `index.ts`**

Replace the body of `packages/api/src/index.ts` with:

```ts
import path from 'path';
import { BoardOptions, IServerAdapter } from '../typings/app';
import { errorHandler } from './handlers/error';
import { createMetricsHistoryHandler } from './handlers/metricsHistory';
import { BaseAdapter } from './queueAdapters/base';
import { getQueuesApi } from './queuesApi';
import { appRoutes } from './routes';

export function createBullBoard({
  queues,
  serverAdapter,
  options = { uiConfig: {} },
}: {
  queues: ReadonlyArray<BaseAdapter>;
  serverAdapter: IServerAdapter;
  options?: BoardOptions;
}) {
  const { bullBoardQueues, setQueues, replaceQueues, addQueue, removeQueue } = getQueuesApi(queues);
  const uiBasePath =
    // oxlint-disable-next-line no-eval
    options.uiBasePath || path.dirname(eval(`require.resolve('@bull-board/ui/package.json')`));

  const apiRoutes = [...appRoutes.api];
  if (options.historyProvider) {
    apiRoutes.push({
      method: 'get',
      route: '/api/metrics/history',
      handler: createMetricsHistoryHandler(options.historyProvider),
    });
  }

  serverAdapter
    .setQueues(bullBoardQueues)
    .setViewsPath(path.join(uiBasePath, 'dist'))
    .setStaticPath('/static', path.join(uiBasePath, 'dist/static'))
    .setUIConfig({
      boardTitle: 'Bull Dashboard',
      favIcon: {
        default: 'static/images/logo.svg',
        alternative: 'static/favicon-32x32.png',
      },
      hasHistoryProvider: Boolean(options.historyProvider),
      ...options.uiConfig,
    })
    .setEntryRoute(appRoutes.entryPoint)
    .setErrorHandler(errorHandler)
    .setApiRoutes(apiRoutes);

  return { setQueues, replaceQueues, addQueue, removeQueue };
}
```

Note: `hasHistoryProvider` is placed before `...options.uiConfig` so an explicit user override still wins, but users normally never set it.

- [ ] **Step 2: Run the Task 2 tests, now passing**

Run: `yarn workspace @bull-board/api build && cd packages/api && yarn test -- metrics-history`
Expected: PASS (all three cases: 404 without provider, delegates with provider, 400 on invalid metric).

- [ ] **Step 3: Run the existing metrics test to confirm no regression**

Run: `cd packages/api && yarn test -- metrics`
Expected: PASS (both `metrics.spec.ts` and `metrics-history.spec.ts`).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/index.ts
git commit -m "feat(api): register optional metrics history endpoint"
```

---

# PHASE 1B: `@bull-board/metrics` package

### Task 4: Scaffold the package

**Files:**
- Create: `packages/metrics/package.json`
- Create: `packages/metrics/tsconfig.json`
- Create: `packages/metrics/jest.config.js`
- Create: `packages/metrics/.gitignore`
- Create: `packages/metrics/README.md`
- Create: `packages/metrics/src/index.ts`

**Interfaces:**
- Produces: the `@bull-board/metrics` workspace, resolvable by the other tasks. Public entry `src/index.ts` (exports filled in later tasks).

- [ ] **Step 1: Create `package.json`**

Create `packages/metrics/package.json` (version matches the monorepo, currently `8.1.2`; keep it in lockstep with the other packages at release time):

```json
{
  "name": "@bull-board/metrics",
  "version": "8.1.2",
  "description": "Opt-in long-retention historical job metrics recorder and provider for bull-board.",
  "keywords": ["bull", "bullmq", "dashboard", "metrics", "history", "queue", "redis"],
  "license": "MIT",
  "author": "felixmosh",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/felixmosh/bull-board.git",
    "directory": "packages/metrics"
  },
  "files": ["dist"],
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "yarn clean && tsc",
    "clean": "rm -rf dist",
    "test": "jest"
  },
  "dependencies": {
    "@bull-board/api": "8.1.2"
  },
  "peerDependencies": {
    "ioredis": "^5.0.0"
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "@types/node": "^22.20.0",
    "bullmq": "^5.79.2",
    "ioredis": "^5.11.1",
    "jest": "^30.4.2",
    "ts-jest": "^29.4.11",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (mirror `packages/api/tsconfig.json`)

```json
{
  "compilerOptions": {
    "outDir": "dist",
    "esModuleInterop": true,
    "lib": ["es2019"],
    "module": "CommonJS",
    "rootDir": "./src",
    "noImplicitAny": true,
    "sourceMap": true,
    "strict": true,
    "target": "es2019",
    "noUnusedParameters": true,
    "noUnusedLocals": true,
    "resolveJsonModule": true,
    "declaration": true,
    "skipLibCheck": true,
    "types": ["node", "jest"]
  },
  "include": ["./src"]
}
```

- [ ] **Step 3: Create `jest.config.js`** (mirror `packages/api/jest.config.js`, add the 30s timeout)

```js
const packageJson = require('./package.json');
const { defaults: tsJestTransform } = require('ts-jest/presets');

module.exports = {
  displayName: packageJson.name,
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    ...tsJestTransform.transform,
  },
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testTimeout: 30000,
};
```

- [ ] **Step 4: Create `.gitignore`**

```
dist
node_modules
```

- [ ] **Step 5: Create a minimal `src/index.ts` placeholder**

```ts
export {};
```

- [ ] **Step 6: Create `README.md`** (short; expanded in Task 10's docs pass if desired)

```md
# @bull-board/metrics

Opt-in long-retention historical job metrics for [bull-board](https://github.com/felixmosh/bull-board).

Snapshots native BullMQ per-minute metrics into long-retention Redis buckets and exposes a
`MetricsHistoryProvider` that feeds bull-board's history charts. Everything is opt-in: the core
`@bull-board/api` stays stateless.

## Precondition

Your BullMQ workers must have native metrics enabled, with a window large enough to survive any
recorder downtime, for example:

    new Worker(name, processor, {
      connection,
      metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
    });

## Usage

    import { MetricsRecorder, RedisMetricsHistoryProvider } from '@bull-board/metrics';

    // In your always-on worker/app process:
    const recorder = new MetricsRecorder({
      queues: [new BullMQAdapter(queue)],
      connection,
      retentionDays: 90,
    });
    recorder.start();

    // Where you build the board:
    createBullBoard({
      queues,
      serverAdapter,
      options: { historyProvider: new RedisMetricsHistoryProvider({ connection }) },
    });

Timestamps and buckets are UTC.
```

- [ ] **Step 7: Install and verify the workspace resolves**

Run: `cd /Users/stosiu/Development/Packages/bull-board && yarn install && yarn workspace @bull-board/api build && yarn workspace @bull-board/metrics build`
Expected: install succeeds; both builds succeed (metrics emits an empty `dist/index.js`).

- [ ] **Step 8: Commit**

```bash
git add packages/metrics/package.json packages/metrics/tsconfig.json packages/metrics/jest.config.js packages/metrics/.gitignore packages/metrics/README.md packages/metrics/src/index.ts
git commit -m "feat(metrics): scaffold @bull-board/metrics package"
```

---

### Task 5: Data-to-minute mapping (pure function)

**Files:**
- Create: `packages/metrics/src/dataMapping.ts`
- Test: `packages/metrics/tests/dataMapping.spec.ts`

**Interfaces:**
- Consumes: `QueueMetrics` (`@bull-board/api/typings/app`).
- Produces: `interface MinutePoint { minute: number; value: number }` and `metricsToMinutePoints(metrics: QueueMetrics | null | undefined): MinutePoint[]`, where `minute` is the absolute minute index (`floor(ts/60000)`) and points are returned newest-first. Empty/zero-only inputs yield `[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/metrics/tests/dataMapping.spec.ts`:

```ts
import type { QueueMetrics } from '@bull-board/api/typings/app';
import { metricsToMinutePoints } from '../src/dataMapping';

function metrics(prevTS: number, data: number[]): QueueMetrics {
  return { meta: { count: 0, prevTS, prevCount: 0 }, data, count: data.length };
}

describe('metricsToMinutePoints', () => {
  it('returns [] for null/empty', () => {
    expect(metricsToMinutePoints(null)).toEqual([]);
    expect(metricsToMinutePoints(metrics(600000, []))).toEqual([]);
  });

  it('maps data[i] to minute floor(prevTS/60000) - 1 - i, newest first', () => {
    // prevTS = 10 minutes in ms -> floor = 10. data[0] -> minute 9, data[1] -> minute 8.
    const result = metricsToMinutePoints(metrics(10 * 60000, [5, 2, 0, 7]));
    expect(result).toEqual([
      { minute: 9, value: 5 },
      { minute: 8, value: 2 },
      { minute: 7, value: 0 },
      { minute: 6, value: 7 },
    ]);
  });

  it('coerces string values to numbers', () => {
    const m = metrics(10 * 60000, ['5', '0'] as unknown as number[]);
    expect(metricsToMinutePoints(m)).toEqual([
      { minute: 9, value: 5 },
      { minute: 8, value: 0 },
    ]);
  });

  it('drops points with non-positive minute index', () => {
    // prevTS at minute 1 -> data[0] minute 0, data[1] minute -1 (dropped).
    const result = metricsToMinutePoints(metrics(1 * 60000, [3, 9]));
    expect(result).toEqual([{ minute: 0, value: 3 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/metrics && yarn test -- dataMapping`
Expected: FAIL with "Cannot find module '../src/dataMapping'".

- [ ] **Step 3: Implement `dataMapping.ts`**

```ts
import type { QueueMetrics } from '@bull-board/api/typings/app';

export interface MinutePoint {
  /** Absolute minute index: Math.floor(timestampMs / 60000). */
  minute: number;
  value: number;
}

const MS_PER_MINUTE = 60000;

/**
 * Map a BullMQ getMetrics result to (minute, value) points, newest first.
 *
 * BullMQ stores the data list newest-first (see collectMetrics.lua). The newest
 * finalized point data[0] belongs to the minute just before prevTS, so
 * data[i] -> minute index floor(prevTS/60000) - 1 - i. The in-progress current
 * minute is never present in data, so every point returned here is immutable.
 */
export function metricsToMinutePoints(metrics: QueueMetrics | null | undefined): MinutePoint[] {
  if (!metrics || !metrics.data || metrics.data.length === 0) {
    return [];
  }
  const prevTS = metrics.meta?.prevTS ?? 0;
  const newestMinute = Math.floor(prevTS / MS_PER_MINUTE) - 1;

  const points: MinutePoint[] = [];
  for (let i = 0; i < metrics.data.length; i++) {
    const minute = newestMinute - i;
    if (minute < 0) {
      break;
    }
    points.push({ minute, value: Number(metrics.data[i]) || 0 });
  }
  return points;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/metrics && yarn test -- dataMapping`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/metrics/src/dataMapping.ts packages/metrics/tests/dataMapping.spec.ts
git commit -m "feat(metrics): add getMetrics data-to-minute mapping"
```

---

### Task 6: Key namespacing + UTC helpers

**Files:**
- Create: `packages/metrics/src/keys.ts`
- Test: `packages/metrics/tests/keys.spec.ts`

**Interfaces:**
- Produces:
  - `const NAMESPACE = 'bull-board:metrics'`
  - `const GLOBAL_QUEUE = '__global__'`
  - `minuteToDay(minute: number): string` returns UTC `YYYY-MM-DD` for an absolute minute index.
  - `dayHashKey(queue: string, metric: string, day: string): string`
  - `totalsHashKey(queue: string, metric: string): string`
  - `dayRange(fromMs: number, toMs: number): string[]` returns the inclusive list of UTC day strings covering `[fromMs, toMs]`.
  - `dayToStartMs(day: string): number` returns the UTC midnight epoch-ms for a `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing test**

Create `packages/metrics/tests/keys.spec.ts`:

```ts
import {
  GLOBAL_QUEUE,
  NAMESPACE,
  dayHashKey,
  dayRange,
  dayToStartMs,
  minuteToDay,
  totalsHashKey,
} from '../src/keys';

describe('keys', () => {
  it('derives the UTC day from a minute index', () => {
    // 2021-01-01T00:00:00Z = 1609459200000 ms = minute 26824320.
    expect(minuteToDay(1609459200000 / 60000)).toBe('2021-01-01');
    // one minute before midnight is still the previous day.
    expect(minuteToDay(1609459200000 / 60000 - 1)).toBe('2020-12-31');
  });

  it('builds namespaced keys', () => {
    expect(dayHashKey('MyQueue', 'completed', '2021-01-01')).toBe(
      `${NAMESPACE}:MyQueue:completed:2021-01-01`
    );
    expect(totalsHashKey(GLOBAL_QUEUE, 'failed')).toBe(`${NAMESPACE}:__global__:failed:totals`);
  });

  it('lists inclusive UTC day range', () => {
    const from = Date.UTC(2021, 0, 1, 23, 0, 0);
    const to = Date.UTC(2021, 0, 3, 1, 0, 0);
    expect(dayRange(from, to)).toEqual(['2021-01-01', '2021-01-02', '2021-01-03']);
  });

  it('round-trips day to UTC midnight ms', () => {
    expect(dayToStartMs('2021-01-01')).toBe(Date.UTC(2021, 0, 1));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/metrics && yarn test -- keys`
Expected: FAIL with "Cannot find module '../src/keys'".

- [ ] **Step 3: Implement `keys.ts`**

```ts
export const NAMESPACE = 'bull-board:metrics';
export const GLOBAL_QUEUE = '__global__';

const MS_PER_MINUTE = 60000;
const MS_PER_DAY = 86400000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function msToDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function minuteToDay(minute: number): string {
  return msToDay(minute * MS_PER_MINUTE);
}

export function dayHashKey(queue: string, metric: string, day: string): string {
  return `${NAMESPACE}:${queue}:${metric}:${day}`;
}

export function totalsHashKey(queue: string, metric: string): string {
  return `${NAMESPACE}:${queue}:${metric}:totals`;
}

export function dayToStartMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function dayRange(fromMs: number, toMs: number): string[] {
  const days: string[] = [];
  let cursor = Date.UTC(
    new Date(fromMs).getUTCFullYear(),
    new Date(fromMs).getUTCMonth(),
    new Date(fromMs).getUTCDate()
  );
  const end = toMs;
  while (cursor <= end) {
    days.push(msToDay(cursor));
    cursor += MS_PER_DAY;
  }
  return days;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/metrics && yarn test -- keys`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/metrics/src/keys.ts packages/metrics/tests/keys.spec.ts
git commit -m "feat(metrics): add key namespacing and UTC helpers"
```

---

### Task 7: `HistoryStore` write/read primitives (atomic Lua upsert)

**Files:**
- Create: `packages/metrics/src/HistoryStore.ts`
- Test: `packages/metrics/tests/HistoryStore.spec.ts`

**Interfaces:**
- Consumes: `ioredis` (`Redis` type via `import type`), `keys.ts` (Task 6).
- Produces: `class HistoryStore`:
  - `constructor(opts: { redis: Redis; retentionDays: number })`
  - `upsertMinute(queue: string, metric: string, minute: number, value: number): Promise<void>` — atomic, idempotent; also updates the queue daily total and the global per-minute + global daily total.
  - `readDailyTotals(queue: string, metric: string, days: string[]): Promise<Record<string, number>>` — reads a totals hash for the given day fields.
  - `readDayMinutes(queue: string, metric: string, day: string): Promise<Record<string, number>>` — reads a day's per-minute hash (field = minute index string).

Storage layout (all fields are integers):
- `bull-board:metrics:{queue}:{metric}:{YYYY-MM-DD}` HASH, field = absolute minute index, value = count. TTL = retention.
- `bull-board:metrics:{queue}:{metric}:totals` HASH, field = `YYYY-MM-DD`, value = day sum. TTL = retention.
- Same two keys under queue `__global__` accumulate the cross-queue rollup.

The upsert is a single Lua script so the compare-and-apply is atomic across processes:

- [ ] **Step 1: Write the failing test**

Create `packages/metrics/tests/HistoryStore.spec.ts`:

```ts
import { Redis } from 'ioredis';
import { HistoryStore } from '../src/HistoryStore';
import { GLOBAL_QUEUE, dayHashKey, minuteToDay, totalsHashKey } from '../src/keys';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('HistoryStore', () => {
  let redis: Redis;
  let store: HistoryStore;
  // minute index for 2021-01-01T00:05:00Z
  const minute = Date.UTC(2021, 0, 1, 0, 5) / 60000;
  const day = minuteToDay(minute);

  beforeEach(async () => {
    redis = new Redis(connection);
    store = new HistoryStore({ redis, retentionDays: 90 });
    await redis.del(
      dayHashKey('Q', 'completed', day),
      totalsHashKey('Q', 'completed'),
      dayHashKey(GLOBAL_QUEUE, 'completed', day),
      totalsHashKey(GLOBAL_QUEUE, 'completed')
    );
  });

  afterEach(async () => {
    await redis.quit();
  });

  it('writes the minute, queue total, global minute, and global total', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);

    expect(await redis.hget(dayHashKey('Q', 'completed', day), String(minute))).toBe('4');
    expect(await redis.hget(totalsHashKey('Q', 'completed'), day)).toBe('4');
    expect(await redis.hget(dayHashKey(GLOBAL_QUEUE, 'completed', day), String(minute))).toBe('4');
    expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)).toBe('4');
  });

  it('is idempotent: re-writing the same minute does not double count', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);
    await store.upsertMinute('Q', 'completed', minute, 4);
    await store.upsertMinute('Q', 'completed', minute, 4);

    expect(await redis.hget(totalsHashKey('Q', 'completed'), day)).toBe('4');
    expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)).toBe('4');
  });

  it('applies a delta when a minute value is corrected upward', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);
    await store.upsertMinute('Q', 'completed', minute, 7);

    expect(await redis.hget(dayHashKey('Q', 'completed', day), String(minute))).toBe('7');
    expect(await redis.hget(totalsHashKey('Q', 'completed'), day)).toBe('7');
  });

  it('accumulates the global rollup across queues', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);
    await store.upsertMinute('Q2', 'completed', minute, 6);

    expect(await redis.hget(dayHashKey(GLOBAL_QUEUE, 'completed', day), String(minute))).toBe('10');
    expect(await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day)).toBe('10');

    await redis.del(dayHashKey('Q2', 'completed', day), totalsHashKey('Q2', 'completed'));
  });

  it('sets a TTL on the day hash', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);
    const ttl = await redis.ttl(dayHashKey('Q', 'completed', day));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(90 * 86400);
  });

  it('reads daily totals and day minutes back', async () => {
    await store.upsertMinute('Q', 'completed', minute, 4);
    expect(await store.readDailyTotals('Q', 'completed', [day])).toEqual({ [day]: 4 });
    expect(await store.readDayMinutes('Q', 'completed', day)).toEqual({ [String(minute)]: 4 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/metrics && yarn test -- HistoryStore`
Expected: FAIL with "Cannot find module '../src/HistoryStore'".

- [ ] **Step 3: Implement `HistoryStore.ts`**

```ts
import type { Redis } from 'ioredis';
import {
  GLOBAL_QUEUE,
  dayHashKey,
  minuteToDay,
  totalsHashKey,
} from './keys';

/**
 * Atomic, idempotent upsert of one minute bucket.
 *
 * KEYS[1] queue day-minute hash     ARGV[1] minute field
 * KEYS[2] queue totals hash         ARGV[2] day field
 * KEYS[3] global day-minute hash    ARGV[3] value
 * KEYS[4] global totals hash        ARGV[4] ttl seconds
 *
 * Computes delta = value - existingMinuteValue (0 if unchanged), applies it to the
 * queue total, the global minute, and the global total, then (re)sets TTLs. Returns delta.
 */
const UPSERT_MINUTE = `
local old = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0')
local val = tonumber(ARGV[3])
if val == old then
  return 0
end
local delta = val - old
redis.call('HSET', KEYS[1], ARGV[1], val)
redis.call('HINCRBY', KEYS[2], ARGV[2], delta)
redis.call('HINCRBY', KEYS[3], ARGV[1], delta)
redis.call('HINCRBY', KEYS[4], ARGV[2], delta)
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[4])
redis.call('EXPIRE', KEYS[3], ARGV[4])
redis.call('EXPIRE', KEYS[4], ARGV[4])
return delta
`;

export class HistoryStore {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;

  constructor(opts: { redis: Redis; retentionDays: number }) {
    this.redis = opts.redis;
    this.ttlSeconds = Math.max(1, Math.floor(opts.retentionDays * 86400));
  }

  async upsertMinute(queue: string, metric: string, minute: number, value: number): Promise<void> {
    const day = minuteToDay(minute);
    await this.redis.eval(
      UPSERT_MINUTE,
      4,
      dayHashKey(queue, metric, day),
      totalsHashKey(queue, metric),
      dayHashKey(GLOBAL_QUEUE, metric, day),
      totalsHashKey(GLOBAL_QUEUE, metric),
      String(minute),
      day,
      String(value),
      String(this.ttlSeconds)
    );
  }

  async readDailyTotals(
    queue: string,
    metric: string,
    days: string[]
  ): Promise<Record<string, number>> {
    if (days.length === 0) {
      return {};
    }
    const values = await this.redis.hmget(totalsHashKey(queue, metric), ...days);
    const out: Record<string, number> = {};
    days.forEach((day, i) => {
      out[day] = Number(values[i]) || 0;
    });
    return out;
  }

  async readDayMinutes(
    queue: string,
    metric: string,
    day: string
  ): Promise<Record<string, number>> {
    const raw = await this.redis.hgetall(dayHashKey(queue, metric, day));
    const out: Record<string, number> = {};
    for (const field of Object.keys(raw)) {
      out[field] = Number(raw[field]) || 0;
    }
    return out;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `docker compose -f docker-compose.redis.yml up -d && cd packages/metrics && yarn test -- HistoryStore`
Expected: PASS (all cases: writes, idempotency, delta correction, global rollup, TTL, readback).

- [ ] **Step 5: Commit**

```bash
git add packages/metrics/src/HistoryStore.ts packages/metrics/tests/HistoryStore.spec.ts
git commit -m "feat(metrics): add idempotent Redis history store"
```

---

### Task 8: `MetricsRecorder` (snapshotter/scheduler)

**Files:**
- Create: `packages/metrics/src/MetricsRecorder.ts`
- Test: `packages/metrics/tests/MetricsRecorder.spec.ts`

**Interfaces:**
- Consumes: `BaseAdapter` (`@bull-board/api/baseAdapter` for the type), `MetricsType` (`@bull-board/api/typings/app`), `HistoryStore` (Task 7), `metricsToMinutePoints` (Task 5), `ioredis` `Redis`.
- Produces: `class MetricsRecorder`:
  - `constructor(opts: { queues: BaseAdapter[]; connection: RedisOptions | Redis; retentionDays?: number; snapshotIntervalMs?: number })` (defaults: `retentionDays = 90`, `snapshotIntervalMs = 60000`).
  - `start(): void` — begins the interval and runs one immediate `snapshot()`.
  - `stop(): void` — clears the interval; if the recorder created its own Redis client, disconnect it.
  - `snapshot(): Promise<void>` — one pass over all queues/metrics; public so tests can drive it deterministically without waiting on timers.

Efficiency + safety: keep an in-memory `Map` of `${queueName}:${metric} -> lastMinute`. Each snapshot fetches the full buffer via `adapter.getMetrics(metric)`, walks the newest-first points and stops at the first `minute <= lastMinute`; upserts the rest; updates `lastMinute`. Correctness never depends on the cursor because the store is idempotent, so a restart (cursor reset) reprocesses the buffer once as no-ops.

- [ ] **Step 1: Write the failing test**

Create `packages/metrics/tests/MetricsRecorder.spec.ts`:

```ts
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { MetricsTime, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { MetricsRecorder } from '../src/MetricsRecorder';
import { GLOBAL_QUEUE, dayHashKey, minuteToDay, totalsHashKey } from '../src/keys';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

async function waitForMetrics(queue: Queue, min: number) {
  for (let i = 0; i < 100; i++) {
    const m = await queue.getMetrics('completed');
    if ((m.data?.length ?? 0) >= min) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('metrics did not populate');
}

describe('MetricsRecorder', () => {
  let redis: Redis;
  let queue: Queue;
  let worker: Worker;

  beforeEach(() => {
    redis = new Redis(connection);
  });

  afterEach(async () => {
    if (worker) await worker.close();
    if (queue) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
    await redis.quit();
  });

  it('snapshots finalized native metrics into the history store', async () => {
    queue = new Queue('RecorderQueue', { connection });
    worker = new Worker('RecorderQueue', async () => 'ok', {
      connection,
      metrics: { maxDataPoints: MetricsTime.ONE_HOUR },
    });

    // Produce jobs so BullMQ records at least one finalized minute bucket.
    for (let i = 0; i < 5; i++) await queue.add('job', {});
    await waitForMetrics(queue, 1);

    const adapter = new BullMQAdapter(queue);
    const recorder = new MetricsRecorder({ queues: [adapter], connection: redis });

    await recorder.snapshot();
    recorder.stop();

    // Sum all stored minute buckets for this queue across whatever days they landed in.
    const nativeCompleted = await adapter.getMetrics('completed');
    const points = nativeCompleted.data.filter((_, i) => i < nativeCompleted.data.length);
    const nativeFinalizedSum = points.reduce((a, b) => a + (Number(b) || 0), 0);

    const name = adapter.getName();
    // Collect stored totals across the day(s) touched.
    const days = new Set<string>();
    const prevMinute = Math.floor((nativeCompleted.meta.prevTS || Date.now()) / 60000);
    for (let m = prevMinute - nativeCompleted.data.length - 1; m <= prevMinute; m++) {
      days.add(minuteToDay(m));
    }
    let storedSum = 0;
    for (const day of days) {
      const v = await redis.hget(totalsHashKey(name, 'completed'), day);
      storedSum += Number(v) || 0;
      // global mirrors the single-queue total here
      const g = await redis.hget(totalsHashKey(GLOBAL_QUEUE, 'completed'), day);
      expect(Number(g) || 0).toBeGreaterThanOrEqual(Number(v) || 0);
    }

    expect(storedSum).toBe(nativeFinalizedSum);
    expect(storedSum).toBeGreaterThan(0);

    // A day-minute hash exists for the queue.
    const anyDay = [...days][0];
    const dayHash = await redis.hgetall(dayHashKey(name, 'completed', anyDay));
    expect(Object.keys(dayHash).length).toBeGreaterThanOrEqual(0);
  });

  it('is idempotent across repeated snapshots', async () => {
    queue = new Queue('RecorderIdemQueue', { connection });
    worker = new Worker('RecorderIdemQueue', async () => 'ok', {
      connection,
      metrics: { maxDataPoints: MetricsTime.ONE_HOUR },
    });
    for (let i = 0; i < 5; i++) await queue.add('job', {});
    await waitForMetrics(queue, 1);

    const adapter = new BullMQAdapter(queue);
    const name = adapter.getName();
    const recorder = new MetricsRecorder({ queues: [adapter], connection: redis });

    await recorder.snapshot();
    const snapshot1 = await redis.hgetall(totalsHashKey(name, 'completed'));
    await recorder.snapshot();
    await recorder.snapshot();
    const snapshot2 = await redis.hgetall(totalsHashKey(name, 'completed'));
    recorder.stop();

    expect(snapshot2).toEqual(snapshot1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/metrics && yarn test -- MetricsRecorder`
Expected: FAIL with "Cannot find module '../src/MetricsRecorder'".

- [ ] **Step 3: Implement `MetricsRecorder.ts`**

```ts
import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import type { MetricsType } from '@bull-board/api/typings/app';
import { Redis, type RedisOptions } from 'ioredis';
import { metricsToMinutePoints } from './dataMapping';
import { HistoryStore } from './HistoryStore';

const METRICS: MetricsType[] = ['completed', 'failed'];

export interface MetricsRecorderOptions {
  queues: BaseAdapter[];
  connection: RedisOptions | Redis;
  retentionDays?: number;
  snapshotIntervalMs?: number;
}

export class MetricsRecorder {
  private readonly queues: BaseAdapter[];
  private readonly store: HistoryStore;
  private readonly redis: Redis;
  private readonly ownsRedis: boolean;
  private readonly intervalMs: number;
  private readonly lastMinute = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(opts: MetricsRecorderOptions) {
    this.queues = opts.queues;
    this.intervalMs = opts.snapshotIntervalMs ?? 60000;
    if (opts.connection instanceof Redis) {
      this.redis = opts.connection;
      this.ownsRedis = false;
    } else {
      this.redis = new Redis(opts.connection);
      this.ownsRedis = true;
    }
    this.store = new HistoryStore({ redis: this.redis, retentionDays: opts.retentionDays ?? 90 });
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.snapshot();
    }, this.intervalMs);
    // Do not keep the event loop alive solely for the recorder.
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
    void this.snapshot();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ownsRedis) {
      this.redis.disconnect();
    }
  }

  async snapshot(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      for (const adapter of this.queues) {
        const name = adapter.getName();
        for (const metric of METRICS) {
          await this.snapshotOne(adapter, name, metric);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async snapshotOne(adapter: BaseAdapter, name: string, metric: MetricsType): Promise<void> {
    const cursorKey = `${name}:${metric}`;
    const seenUpTo = this.lastMinute.get(cursorKey) ?? -1;

    const metrics = await adapter.getMetrics(metric).catch(() => null);
    const points = metricsToMinutePoints(metrics);
    if (points.length === 0) {
      return;
    }

    let newest = seenUpTo;
    for (const point of points) {
      if (point.minute <= seenUpTo) {
        break; // points are newest-first; everything older is already stored
      }
      await this.store.upsertMinute(name, metric, point.minute, point.value);
      if (point.minute > newest) {
        newest = point.minute;
      }
    }
    this.lastMinute.set(cursorKey, newest);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `yarn workspace @bull-board/api build && cd packages/metrics && yarn test -- MetricsRecorder`
Expected: PASS (both cases). Note the suite starts a real Worker; the 30s timeout accommodates metric population.

- [ ] **Step 5: Commit**

```bash
git add packages/metrics/src/MetricsRecorder.ts packages/metrics/tests/MetricsRecorder.spec.ts
git commit -m "feat(metrics): add MetricsRecorder snapshotter"
```

---

### Task 9: `RedisMetricsHistoryProvider`

**Files:**
- Create: `packages/metrics/src/RedisMetricsHistoryProvider.ts`
- Test: `packages/metrics/tests/RedisMetricsHistoryProvider.spec.ts`

**Interfaces:**
- Consumes: `MetricsHistoryProvider`, `MetricsHistoryQuery`, `MetricsHistoryPoint` (`@bull-board/api/typings/app`); `HistoryStore` (Task 7); `keys.ts` (Task 6); `ioredis` `Redis`.
- Produces: `class RedisMetricsHistoryProvider implements MetricsHistoryProvider`:
  - `constructor(opts: { connection: RedisOptions | Redis; retentionDays?: number })`
  - `getHistory(query): Promise<MetricsHistoryPoint[]>`

Semantics:
- Target queue is `query.queue` if given, else `GLOBAL_QUEUE`.
- `granularity: 'day'`: read the totals hash for the UTC days spanning `[from, to]`; emit one point per day at UTC midnight ms, filtered so `from <= ts <= to`.
- `granularity: 'hour'`: for each day in range, read the per-minute day hash, bucket each minute into its UTC hour start ms, sum; emit hour points within `[from, to]`, sorted ascending. Zero-value hours are omitted (sparse series).

- [ ] **Step 1: Write the failing test**

Create `packages/metrics/tests/RedisMetricsHistoryProvider.spec.ts`:

```ts
import { Redis } from 'ioredis';
import { HistoryStore } from '../src/HistoryStore';
import { RedisMetricsHistoryProvider } from '../src/RedisMetricsHistoryProvider';
import { GLOBAL_QUEUE, dayHashKey, minuteToDay, totalsHashKey } from '../src/keys';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('RedisMetricsHistoryProvider', () => {
  let redis: Redis;
  let store: HistoryStore;
  let provider: RedisMetricsHistoryProvider;

  const d1m = Date.UTC(2021, 0, 1, 10, 0) / 60000; // 2021-01-01 10:00
  const d1m2 = Date.UTC(2021, 0, 1, 10, 30) / 60000; // same hour
  const d2m = Date.UTC(2021, 0, 2, 5, 0) / 60000; // 2021-01-02 05:00

  beforeEach(async () => {
    redis = new Redis(connection);
    store = new HistoryStore({ redis, retentionDays: 90 });
    for (const day of ['2021-01-01', '2021-01-02']) {
      await redis.del(
        dayHashKey('Q', 'completed', day),
        dayHashKey(GLOBAL_QUEUE, 'completed', day)
      );
    }
    await redis.del(totalsHashKey('Q', 'completed'), totalsHashKey(GLOBAL_QUEUE, 'completed'));

    await store.upsertMinute('Q', 'completed', d1m, 3);
    await store.upsertMinute('Q', 'completed', d1m2, 4);
    await store.upsertMinute('Q', 'completed', d2m, 5);
    provider = new RedisMetricsHistoryProvider({ connection: redis });
  });

  afterEach(async () => {
    await redis.quit();
  });

  it('returns daily totals within range', async () => {
    const points = await provider.getHistory({
      queue: 'Q',
      metric: 'completed',
      from: Date.UTC(2021, 0, 1),
      to: Date.UTC(2021, 0, 2, 23, 59),
      granularity: 'day',
    });
    expect(points).toEqual([
      { ts: Date.UTC(2021, 0, 1), value: 7 },
      { ts: Date.UTC(2021, 0, 2), value: 5 },
    ]);
  });

  it('returns hourly buckets within range', async () => {
    const points = await provider.getHistory({
      queue: 'Q',
      metric: 'completed',
      from: Date.UTC(2021, 0, 1),
      to: Date.UTC(2021, 0, 1, 23, 59),
      granularity: 'hour',
    });
    expect(points).toEqual([{ ts: Date.UTC(2021, 0, 1, 10), value: 7 }]);
  });

  it('reads the global rollup when queue is omitted', async () => {
    const points = await provider.getHistory({
      metric: 'completed',
      from: Date.UTC(2021, 0, 1),
      to: Date.UTC(2021, 0, 2, 23, 59),
      granularity: 'day',
    });
    expect(points).toEqual([
      { ts: Date.UTC(2021, 0, 1), value: 7 },
      { ts: Date.UTC(2021, 0, 2), value: 5 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/metrics && yarn test -- RedisMetricsHistoryProvider`
Expected: FAIL with "Cannot find module '../src/RedisMetricsHistoryProvider'".

- [ ] **Step 3: Implement `RedisMetricsHistoryProvider.ts`**

```ts
import type {
  MetricsHistoryPoint,
  MetricsHistoryProvider,
  MetricsHistoryQuery,
} from '@bull-board/api/typings/app';
import { Redis, type RedisOptions } from 'ioredis';
import { HistoryStore } from './HistoryStore';
import { GLOBAL_QUEUE, dayRange, dayToStartMs } from './keys';

const MS_PER_MINUTE = 60000;
const MS_PER_HOUR = 3600000;

export interface RedisMetricsHistoryProviderOptions {
  connection: RedisOptions | Redis;
  retentionDays?: number;
}

export class RedisMetricsHistoryProvider implements MetricsHistoryProvider {
  private readonly store: HistoryStore;
  private readonly redis: Redis;
  private readonly ownsRedis: boolean;

  constructor(opts: RedisMetricsHistoryProviderOptions) {
    if (opts.connection instanceof Redis) {
      this.redis = opts.connection;
      this.ownsRedis = false;
    } else {
      this.redis = new Redis(opts.connection);
      this.ownsRedis = true;
    }
    this.store = new HistoryStore({ redis: this.redis, retentionDays: opts.retentionDays ?? 90 });
  }

  disconnect(): void {
    if (this.ownsRedis) {
      this.redis.disconnect();
    }
  }

  async getHistory(query: MetricsHistoryQuery): Promise<MetricsHistoryPoint[]> {
    const queue = query.queue ?? GLOBAL_QUEUE;
    const days = dayRange(query.from, query.to);

    if (query.granularity === 'day') {
      const totals = await this.store.readDailyTotals(queue, query.metric, days);
      return days
        .map((day) => ({ ts: dayToStartMs(day), value: totals[day] ?? 0 }))
        .filter((p) => p.ts >= dayFloor(query.from) && p.ts <= query.to);
    }

    // hour granularity
    const hourBuckets = new Map<number, number>();
    for (const day of days) {
      const minutes = await this.store.readDayMinutes(queue, query.metric, day);
      for (const field of Object.keys(minutes)) {
        const minute = Number(field);
        const ts = minute * MS_PER_MINUTE;
        if (ts < query.from || ts > query.to) {
          continue;
        }
        const hourTs = Math.floor(ts / MS_PER_HOUR) * MS_PER_HOUR;
        hourBuckets.set(hourTs, (hourBuckets.get(hourTs) ?? 0) + minutes[field]);
      }
    }
    return [...hourBuckets.entries()]
      .map(([ts, value]) => ({ ts, value }))
      .sort((a, b) => a.ts - b.ts);
  }
}

function dayFloor(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
```

Note: daily points are filtered by `dayFloor(from)` so a `from` that lands mid-day still includes that whole day's total (days are indivisible at day granularity), while the `to` bound is compared directly.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn workspace @bull-board/api build && cd packages/metrics && yarn test -- RedisMetricsHistoryProvider`
Expected: PASS (daily, hourly, global cases).

- [ ] **Step 5: Export the public API from `src/index.ts`**

Replace `packages/metrics/src/index.ts`:

```ts
export { MetricsRecorder } from './MetricsRecorder';
export type { MetricsRecorderOptions } from './MetricsRecorder';
export { RedisMetricsHistoryProvider } from './RedisMetricsHistoryProvider';
export type { RedisMetricsHistoryProviderOptions } from './RedisMetricsHistoryProvider';
```

- [ ] **Step 6: Build the package**

Run: `yarn workspace @bull-board/metrics build`
Expected: builds, emits `dist/index.js` + `dist/index.d.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/metrics/src/RedisMetricsHistoryProvider.ts packages/metrics/tests/RedisMetricsHistoryProvider.spec.ts packages/metrics/src/index.ts
git commit -m "feat(metrics): add RedisMetricsHistoryProvider and public exports"
```

---

### Task 10: End-to-end package test (recorder to provider round trip)

**Files:**
- Create: `packages/metrics/tests/e2e.spec.ts`

**Interfaces:**
- Consumes: everything above, plus a real BullMQ `Queue` + `Worker` and `BullMQAdapter`.

- [ ] **Step 1: Write the test**

Create `packages/metrics/tests/e2e.spec.ts`:

```ts
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { MetricsTime, Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { MetricsRecorder } from '../src/MetricsRecorder';
import { RedisMetricsHistoryProvider } from '../src/RedisMetricsHistoryProvider';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

async function waitForMetrics(queue: Queue, min: number) {
  for (let i = 0; i < 100; i++) {
    const m = await queue.getMetrics('completed');
    if ((m.data?.length ?? 0) >= min) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('metrics did not populate');
}

describe('metrics e2e', () => {
  let redis: Redis;
  let queue: Queue;
  let worker: Worker;

  beforeEach(() => {
    redis = new Redis(connection);
  });

  afterEach(async () => {
    if (worker) await worker.close();
    if (queue) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
    await redis.quit();
  });

  it('records native metrics and serves them through the provider (daily total matches)', async () => {
    queue = new Queue('E2EQueue', { connection });
    worker = new Worker('E2EQueue', async () => 'ok', {
      connection,
      metrics: { maxDataPoints: MetricsTime.ONE_HOUR },
    });
    for (let i = 0; i < 6; i++) await queue.add('job', {});
    await waitForMetrics(queue, 1);

    const adapter = new BullMQAdapter(queue);
    const recorder = new MetricsRecorder({ queues: [adapter], connection: redis });
    await recorder.snapshot();
    recorder.stop();

    const native = await adapter.getMetrics('completed');
    const finalizedSum = native.data.reduce((a, b) => a + (Number(b) || 0), 0);

    const provider = new RedisMetricsHistoryProvider({ connection: redis });
    const now = native.meta.prevTS || Date.now();
    const points = await provider.getHistory({
      queue: adapter.getName(),
      metric: 'completed',
      from: now - 3 * 86400000,
      to: now,
      granularity: 'day',
    });
    const providerSum = points.reduce((a, p) => a + p.value, 0);

    expect(providerSum).toBe(finalizedSum);
    expect(providerSum).toBeGreaterThan(0);

    // Global rollup equals the single queue here.
    const globalPoints = await provider.getHistory({
      metric: 'completed',
      from: now - 3 * 86400000,
      to: now,
      granularity: 'day',
    });
    expect(globalPoints.reduce((a, p) => a + p.value, 0)).toBe(finalizedSum);
  });
});
```

- [ ] **Step 2: Run it**

Run: `yarn workspace @bull-board/api build && cd packages/metrics && yarn test -- e2e`
Expected: PASS.

- [ ] **Step 3: Run the whole metrics suite**

Run: `cd packages/metrics && yarn test`
Expected: PASS (dataMapping, keys, HistoryStore, MetricsRecorder, RedisMetricsHistoryProvider, e2e).

- [ ] **Step 4: Commit**

```bash
git add packages/metrics/tests/e2e.spec.ts
git commit -m "test(metrics): add recorder-to-provider e2e"
```

---

# PHASE 1C: UI (`packages/ui`)

> UI note: `packages/ui` is excluded from the aggregate `yarn test` and has no component test harness for this area. The verification gate for UI tasks is a successful production build (`yarn workspace @bull-board/ui build`, which type-checks via rsbuild + tsc) plus a manual dev-server check. Do not add a new test framework (out of scope, YAGNI).

### Task 11: UI data layer (Api method, query key, hook)

**Files:**
- Modify: `packages/ui/src/services/Api.ts`
- Modify: `packages/ui/src/hooks/queryKeys.ts`
- Create: `packages/ui/src/hooks/useHistoryMetrics.ts`

**Interfaces:**
- Consumes: `GetMetricsHistoryResponse` (Task 1, `@bull-board/api/typings/responses`); `MetricsType`, `MetricsHistoryGranularity`, `MetricsHistoryPoint` (`@bull-board/api/typings/app`).
- Produces:
  - `Api.getHistoryMetrics(params: { queue?: string; metric: MetricsType; from: number; to: number; granularity: MetricsHistoryGranularity }): Promise<GetMetricsHistoryResponse>`
  - `queryKeys.historyMetrics(params)` key
  - `useHistoryMetrics(params, enabled)` hook returning `{ points, loading }`.

- [ ] **Step 1: Add the Api method**

In `packages/ui/src/services/Api.ts`, add the response type to the existing `@bull-board/api/typings/responses` import (join it with the other response imports), then add near `getMetrics` (around line 148):

```ts
  public getHistoryMetrics(params: {
    queue?: string;
    metric: MetricsType;
    from: number;
    to: number;
    granularity: MetricsHistoryGranularity;
  }): Promise<GetMetricsHistoryResponse> {
    return this.axios.get('/metrics/history', {
      params: {
        ...(params.queue ? { queue: params.queue } : {}),
        metric: params.metric,
        from: params.from,
        to: params.to,
        granularity: params.granularity,
      },
    });
  }
```

Add `MetricsType` and `MetricsHistoryGranularity` to the existing `@bull-board/api/typings/app` import in that file if not already present.

- [ ] **Step 2: Add the query key**

In `packages/ui/src/hooks/queryKeys.ts`, add inside the `queryKeys` object:

```ts
  historyMetrics: (params: {
    queue?: string;
    metric: string;
    from: number;
    to: number;
    granularity: string;
  }) => ['historyMetrics', params] as const,
```

- [ ] **Step 3: Create the hook**

Create `packages/ui/src/hooks/useHistoryMetrics.ts`:

```ts
import type {
  MetricsHistoryGranularity,
  MetricsHistoryPoint,
  MetricsType,
} from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useSettingsStore } from './useSettings';

export interface UseHistoryMetricsParams {
  queue?: string;
  metric: MetricsType;
  from: number;
  to: number;
  granularity: MetricsHistoryGranularity;
}

export function useHistoryMetrics(params: UseHistoryMetricsParams, enabled: boolean) {
  const api = useApi();
  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);

  const { data, isPending } = useQuery({
    queryKey: queryKeys.historyMetrics(params),
    queryFn: () => api.getHistoryMetrics(params),
    enabled,
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
  });

  const points: MetricsHistoryPoint[] = data?.points ?? [];
  return { points, loading: isPending };
}
```

- [ ] **Step 4: Build to type-check**

Run: `yarn workspace @bull-board/api build && yarn workspace @bull-board/ui build`
Expected: builds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/services/Api.ts packages/ui/src/hooks/queryKeys.ts packages/ui/src/hooks/useHistoryMetrics.ts
git commit -m "feat(ui): add history metrics data layer"
```

---

### Task 12: Range selector + history rendering on `QueueMetrics`

**Files:**
- Modify: `packages/ui/src/components/QueueMetrics/QueueMetrics.tsx`
- Modify: `packages/ui/src/components/QueueMetrics/QueueMetrics.module.css`
- Modify: the English locale file under `packages/ui/src/static/locales/` (locate the file containing the `METRICS` keys, e.g. `en/messages.json`, and add the new keys there; then run `yarn workspace @bull-board/ui sync:locales`).

**Interfaces:**
- Consumes: `useHistoryMetrics` (Task 11); `useUIConfig` (existing) for `hasHistoryProvider`; `MetricsHistoryPoint`.

Behavior: add a small range selector (`60m | 7d | 30d | 90d`) to the chart header. `60m` keeps the existing native `useMetrics` path unchanged. `7d/30d/90d` call `useHistoryMetrics` (granularity `day`) for both `completed` and `failed`, and render an area/bar chart of daily points. The `7d/30d/90d` options are only shown when `useUIConfig().hasHistoryProvider` is true; when false the component renders exactly as today (native only).

- [ ] **Step 1: Locate the METRICS i18n keys**

Run: `cd packages/ui && grep -rl "METRICS" src/static/locales/en* src/static/locales 2>/dev/null | head`
Expected: the path to the English locale JSON that holds `METRICS.TITLE`, `METRICS.COMPLETED`, etc. Open it.

- [ ] **Step 2: Add new i18n keys**

In the English locale JSON, inside the `METRICS` object, add:

```json
"RANGE_60M": "60m",
"RANGE_7D": "7d",
"RANGE_30D": "30d",
"RANGE_90D": "90d",
"HISTORY_EMPTY": "No history recorded yet for this range.",
"DAILY_COMPLETED": "Completed / day",
"DAILY_FAILED": "Failed / day"
```

Then run: `yarn workspace @bull-board/ui sync:locales`
Expected: keys propagate to the other locale files (as untranslated copies).

- [ ] **Step 3: Refactor `QueueMetrics.tsx` to add the range selector**

Edit `packages/ui/src/components/QueueMetrics/QueueMetrics.tsx`. Keep the existing native 60m rendering intact (the `toSeries`/`WINDOW` logic and the current chart). Introduce a `range` state and, for non-60m ranges, a history chart. Concretely:

1. Add imports at the top:

```ts
import { useState } from 'react';
import { useUIConfig } from '../../hooks/useUIConfig';
import { useHistoryMetrics } from '../../hooks/useHistoryMetrics';
```

2. Add range definitions above the component:

```ts
type MetricsRange = '60m' | '7d' | '30d' | '90d';

const HISTORY_RANGES: Record<Exclude<MetricsRange, '60m'>, number> = {
  '7d': 7 * 86400000,
  '30d': 30 * 86400000,
  '90d': 90 * 86400000,
};
```

3. Inside the component, after `const { metrics, loading } = useMetrics(queue.name);`, add:

```ts
const { hasHistoryProvider = false } = useUIConfig();
const [range, setRange] = useState<MetricsRange>('60m');
const isHistory = range !== '60m' && hasHistoryProvider;

const now = Date.now();
const historyFrom = isHistory ? now - HISTORY_RANGES[range as Exclude<MetricsRange, '60m'>] : 0;

const completedHistory = useHistoryMetrics(
  { queue: queue.name, metric: 'completed', from: historyFrom, to: now, granularity: 'day' },
  isHistory
);
const failedHistory = useHistoryMetrics(
  { queue: queue.name, metric: 'failed', from: historyFrom, to: now, granularity: 'day' },
  isHistory
);
```

4. Render a range selector in the header (only expose history ranges when `hasHistoryProvider`). Add, inside the `.header` block after the legend:

```tsx
{hasHistoryProvider && (
  <div className={s.rangeSelector} role="tablist" aria-label={t('METRICS.TITLE')}>
    {(['60m', '7d', '30d', '90d'] as MetricsRange[]).map((r) => (
      <button
        key={r}
        type="button"
        role="tab"
        aria-selected={range === r}
        className={range === r ? `${s.rangeButton} ${s.rangeButtonActive}` : s.rangeButton}
        onClick={() => setRange(r)}
      >
        {t(`METRICS.RANGE_${r.toUpperCase()}` as const)}
      </button>
    ))}
  </div>
)}
```

5. When `isHistory`, render a daily chart instead of the native one. Build the merged series:

```ts
const historyData = (() => {
  const byTs = new Map<number, { ts: number; completed: number; failed: number }>();
  for (const p of completedHistory.points) {
    byTs.set(p.ts, { ts: p.ts, completed: p.value, failed: 0 });
  }
  for (const p of failedHistory.points) {
    const row = byTs.get(p.ts) ?? { ts: p.ts, completed: 0, failed: 0 };
    row.failed = p.value;
    byTs.set(p.ts, row);
  }
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
})();
```

Then, in the component body, branch: if `isHistory`, render a `Card` with the header + range selector and either the `HISTORY_EMPTY` message (when `historyData.length === 0` and not loading) or an `AreaChart`/`BarChart` over `historyData` with `dataKey="completed"` and `dataKey="failed"`, using the same `var(--completed)`/`var(--failed)` colors and `XAxis dataKey="ts"` (formatted as a short date via `new Date(ts).toLocaleDateString()`), `YAxis hide`. Reuse the existing gradient defs and summary stat markup pattern (completed total, failed total over the range). Keep `isAnimationActive={false}`.

Keep the existing native branch (60m) exactly as it is today when `!isHistory`.

Full illustrative structure for the history branch (place before the existing native `return`):

```tsx
if (isHistory) {
  const totalCompleted = historyData.reduce((a, r) => a + r.completed, 0);
  const totalFailed = historyData.reduce((a, r) => a + r.failed, 0);
  const historyLoading =
    (completedHistory.loading || failedHistory.loading) && historyData.length === 0;

  return (
    <Card className={s.metricsCard}>
      <div className={s.header}>
        <h3 className={s.title}>{t('METRICS.TITLE')}</h3>
        <div className={s.legend}>
          <span className={s.legendItem}>
            <span className={s.swatch} style={{ backgroundColor: 'var(--completed)' }} />
            {t('METRICS.COMPLETED')}
          </span>
          <span className={s.legendItem}>
            <span className={s.swatch} style={{ backgroundColor: 'var(--failed)' }} />
            {t('METRICS.FAILED')}
          </span>
        </div>
        <div className={s.rangeSelector} role="tablist" aria-label={t('METRICS.TITLE')}>
          {(['60m', '7d', '30d', '90d'] as MetricsRange[]).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              className={range === r ? `${s.rangeButton} ${s.rangeButtonActive}` : s.rangeButton}
              onClick={() => setRange(r)}
            >
              {t(`METRICS.RANGE_${r.toUpperCase()}` as const)}
            </button>
          ))}
        </div>
      </div>

      {historyLoading ? null : historyData.length === 0 ? (
        <p className={s.empty}>{t('METRICS.HISTORY_EMPTY')}</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={historyData} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="metric-completed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--completed)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--completed)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="metric-failed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--failed)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--failed)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="ts"
                tickFormatter={(ts: number) => new Date(ts).toLocaleDateString()}
                hide
              />
              <YAxis hide domain={[0, 'dataMax']} />
              <Tooltip
                isAnimationActive={false}
                labelFormatter={(ts) => new Date(ts as number).toLocaleDateString()}
              />
              <Area
                type="monotone"
                dataKey="completed"
                stroke="var(--completed)"
                strokeWidth={1.5}
                fill="url(#metric-completed)"
                dot={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="failed"
                stroke="var(--failed)"
                strokeWidth={1.5}
                fill="url(#metric-failed)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className={s.summary}>
            <div className={s.stat}>
              <span className={s.statValue}>{totalCompleted}</span>
              <span className={s.statLabel}>{t('METRICS.DAILY_COMPLETED')}</span>
            </div>
            <div className={s.stat}>
              <span className={s.statValue}>{totalFailed}</span>
              <span className={s.statLabel}>{t('METRICS.DAILY_FAILED')}</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
```

Also add the range selector into the existing native `return` header (the `hasHistoryProvider &&` block from sub-step 4) so switching works from the 60m view too.

- [ ] **Step 4: Add styles**

In `packages/ui/src/components/QueueMetrics/QueueMetrics.module.css`, append:

```css
.rangeSelector {
  display: inline-flex;
  gap: 2px;
  margin-left: auto;
}

.rangeButton {
  border: none;
  background: transparent;
  color: var(--text-color, inherit);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.6;
}

.rangeButtonActive {
  opacity: 1;
  background: var(--accent-color, rgba(0, 0, 0, 0.08));
  color: #fff;
}
```

(If `.header` is not already a flex row, ensure it is so `margin-left: auto` right-aligns the selector; check the existing `.header` rule and add `display: flex; align-items: center;` if missing.)

- [ ] **Step 5: Build to type-check**

Run: `yarn workspace @bull-board/api build && yarn workspace @bull-board/ui build`
Expected: builds with no type errors.

- [ ] **Step 6: Manual verification (dev server)**

Follow these steps and confirm before checking the box:
1. `docker compose -f docker-compose.redis.yml up -d`
2. In `example.ts` (repo root dev server), enable a worker with `metrics: { maxDataPoints: MetricsTime.ONE_WEEK }`, construct a `MetricsRecorder` and `RedisMetricsHistoryProvider` from `@bull-board/metrics`, pass the provider to `createBullBoard` options, and `recorder.start()`. (See Task 14 for the canonical example wiring; you can temporarily inline it.)
3. `yarn build && yarn dev`, open the UI at `/ui`, open a queue with recorded jobs.
4. Confirm the range selector shows `60m 7d 30d 90d`, `60m` matches current behavior, and `7d` renders daily bars (or the empty message until a day of data exists).
5. Temporarily remove the `historyProvider` option and confirm the selector disappears and the chart is unchanged.

Expected: all confirmed.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/QueueMetrics/QueueMetrics.tsx packages/ui/src/components/QueueMetrics/QueueMetrics.module.css packages/ui/src/static/locales
git commit -m "feat(ui): add history range selector to queue metrics chart"
```

---

### Task 13: Cross-queue global view on the overview page

**Files:**
- Create: `packages/ui/src/components/GlobalMetrics/GlobalMetrics.tsx`
- Create: `packages/ui/src/components/GlobalMetrics/GlobalMetrics.module.css`
- Modify: `packages/ui/src/pages/OverviewPage/OverviewPage.tsx`
- Modify: the English locale file (add `GLOBAL_METRICS` keys, then `sync:locales`).

**Interfaces:**
- Consumes: `useHistoryMetrics` (Task 11, called with `queue` omitted for the global rollup); `useUIConfig` for `hasHistoryProvider`.
- Produces: a `GlobalMetrics` component rendered near the top of `OverviewPage`, only when `hasHistoryProvider` is true.

- [ ] **Step 1: Add i18n keys**

In the English locale JSON add a `GLOBAL_METRICS` object:

```json
"GLOBAL_METRICS": {
  "TITLE": "All queues",
  "COMPLETED": "Completed",
  "FAILED": "Failed",
  "EMPTY": "No history recorded yet."
}
```

Run: `yarn workspace @bull-board/ui sync:locales`

- [ ] **Step 2: Create `GlobalMetrics.tsx`**

```tsx
import type { MetricsRange } from '../QueueMetrics/QueueMetrics';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useHistoryMetrics } from '../../hooks/useHistoryMetrics';
import { Card } from '../Card/Card';
import s from './GlobalMetrics.module.css';

const RANGES: Record<string, number> = {
  '7d': 7 * 86400000,
  '30d': 30 * 86400000,
  '90d': 90 * 86400000,
};

export const GlobalMetrics = () => {
  const { t } = useTranslation();
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');
  const now = Date.now();
  const from = now - RANGES[range];

  const completed = useHistoryMetrics(
    { metric: 'completed', from, to: now, granularity: 'day' },
    true
  );
  const failed = useHistoryMetrics({ metric: 'failed', from, to: now, granularity: 'day' }, true);

  const byTs = new Map<number, { ts: number; completed: number; failed: number }>();
  for (const p of completed.points) byTs.set(p.ts, { ts: p.ts, completed: p.value, failed: 0 });
  for (const p of failed.points) {
    const row = byTs.get(p.ts) ?? { ts: p.ts, completed: 0, failed: 0 };
    row.failed = p.value;
    byTs.set(p.ts, row);
  }
  const data = [...byTs.values()].sort((a, b) => a.ts - b.ts);

  return (
    <Card className={s.card}>
      <div className={s.header}>
        <h3 className={s.title}>{t('GLOBAL_METRICS.TITLE')}</h3>
        <div className={s.rangeSelector}>
          {(['7d', '30d', '90d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={range === r ? `${s.rangeButton} ${s.rangeButtonActive}` : s.rangeButton}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <p className={s.empty}>{t('GLOBAL_METRICS.EMPTY')}</p>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="global-completed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--completed)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--completed)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="global-failed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--failed)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--failed)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="ts"
              tickFormatter={(ts: number) => new Date(ts).toLocaleDateString()}
              hide
            />
            <YAxis hide domain={[0, 'dataMax']} />
            <Tooltip
              isAnimationActive={false}
              labelFormatter={(ts) => new Date(ts as number).toLocaleDateString()}
            />
            <Area
              type="monotone"
              dataKey="completed"
              stroke="var(--completed)"
              strokeWidth={1.5}
              fill="url(#global-completed)"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="failed"
              stroke="var(--failed)"
              strokeWidth={1.5}
              fill="url(#global-failed)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
};
```

Note: if importing `MetricsRange` from the QueueMetrics module causes a circular or unused-import lint issue, drop that import; `GlobalMetrics` defines its own local range union and does not need it.

- [ ] **Step 3: Create `GlobalMetrics.module.css`**

```css
.card {
  margin-bottom: 12px;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.title {
  margin: 0;
  font-size: 14px;
}

.rangeSelector {
  display: inline-flex;
  gap: 2px;
  margin-left: auto;
}

.rangeButton {
  border: none;
  background: transparent;
  color: var(--text-color, inherit);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.6;
}

.rangeButtonActive {
  opacity: 1;
  background: var(--accent-color, rgba(0, 0, 0, 0.08));
  color: #fff;
}

.empty {
  opacity: 0.6;
  font-size: 13px;
}
```

- [ ] **Step 4: Render it on the overview page**

In `packages/ui/src/pages/OverviewPage/OverviewPage.tsx`:
1. Add imports:

```ts
import { GlobalMetrics } from '../../components/GlobalMetrics/GlobalMetrics';
```

2. `useUIConfig()` is already consumed on the page (line ~26). Destructure `hasHistoryProvider`:

```ts
const { hasHistoryProvider = false } = useUIConfig();
```

(Merge with the existing `useUIConfig()` call rather than calling it twice.)

3. Render `GlobalMetrics` at the top of the page content, gated:

```tsx
{hasHistoryProvider && <GlobalMetrics />}
```

Place it above the queue grid/tree.

- [ ] **Step 5: Build to type-check**

Run: `yarn workspace @bull-board/api build && yarn workspace @bull-board/ui build`
Expected: builds with no type errors.

- [ ] **Step 6: Manual verification**

With the dev server wired as in Task 12 step 6, open the overview page (`/ui`). Confirm the "All queues" card appears with `7d/30d/90d`, shows summed daily throughput across queues (or the empty message), and disappears when the provider is not configured.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/GlobalMetrics packages/ui/src/pages/OverviewPage/OverviewPage.tsx packages/ui/src/static/locales
git commit -m "feat(ui): add cross-queue global metrics overview"
```

---

# PHASE 1D: Wiring, docs, and final checks

### Task 14: Example wiring + package README polish

**Files:**
- Modify: `example.ts` (repo root dev server) — demonstrate the recorder + provider.
- Modify: `packages/metrics/README.md` if anything drifted.

**Interfaces:**
- Consumes: `MetricsRecorder`, `RedisMetricsHistoryProvider` (`@bull-board/metrics`).

- [ ] **Step 1: Read the current `example.ts`**

Run: `sed -n '1,120p' /Users/stosiu/Development/Packages/bull-board/example.ts`
Identify where queues, the worker, and `createBullBoard` are set up.

- [ ] **Step 2: Wire the recorder and provider into `example.ts`**

- Ensure the example Worker enables metrics: add `metrics: { maxDataPoints: MetricsTime.ONE_WEEK }` to its options (import `MetricsTime` from `bullmq`).
- Import `{ MetricsRecorder, RedisMetricsHistoryProvider } from '@bull-board/metrics'`.
- After building the queue adapters, before/after `createBullBoard`, add:

```ts
const historyProvider = new RedisMetricsHistoryProvider({ connection: redisOptions });
const recorder = new MetricsRecorder({ queues: queueAdapters, connection: redisOptions });
recorder.start();
```

- Pass `options: { historyProvider }` (merge with any existing `options`) into `createBullBoard`.

(Use whatever the file already calls its Redis connection object and adapter array; match existing names.)

- [ ] **Step 3: Build and run the dev server end to end**

Run: `docker compose -f docker-compose.redis.yml up -d && yarn workspace @bull-board/api build && yarn workspace @bull-board/metrics build && yarn workspace @bull-board/ui build && yarn dev`
Open `/ui`, generate some jobs, wait for a finalized minute, and confirm the 60m native chart still works and the history ranges + global card populate over time.
Expected: all confirmed.

- [ ] **Step 4: Commit**

```bash
git add example.ts packages/metrics/README.md
git commit -m "docs(metrics): wire recorder and provider into the dev example"
```

---

### Task 15: Repo-wide verification and lint

- [ ] **Step 1: Rebuild everything that can build**

Run: `yarn workspace @bull-board/api build && yarn workspace @bull-board/metrics build && yarn workspace @bull-board/ui build`
Expected: all succeed. (The root `yarn build` may still fail on the pre-existing Fastify TS error, per CLAUDE.md; build these workspaces individually.)

- [ ] **Step 2: Run the api and metrics test suites**

Run: `cd packages/api && yarn test -- metrics && cd ../metrics && yarn test`
Expected: PASS. Confirm no regression in `packages/api` metrics tests.

- [ ] **Step 3: Lint the changed packages**

Run: `cd /Users/stosiu/Development/Packages/bull-board && npx oxlint './packages/api/**/*.{ts,tsx}' './packages/metrics/**/*.{ts,tsx}' './packages/ui/**/*.{ts,tsx}' --fix`
Expected: no remaining errors. Re-commit if `--fix` changed files.

- [ ] **Step 4: Grep the diff for em-dashes (hard rule)**

Run: `git diff master --stat && git log master..HEAD -p | grep -n "—" || echo "no em-dashes"`
Expected: prints "no em-dashes". If any are found, replace them and amend.

- [ ] **Step 5: Final commit if lint/format changed anything**

```bash
git add -A
git commit -m "chore: lint historical metrics feature" || echo "nothing to commit"
```

---

## Self-Review (completed against the design doc)

- **Snapshot capture of native getMetrics** → Tasks 5, 8. Mapping verified against BullMQ Lua source (Global Constraints).
- **Idempotent by minute, no singleton** → Task 7 (atomic Lua upsert), verified by the idempotency test.
- **Core historyProvider seam + single optional endpoint, stateless** → Tasks 1, 2, 3. No server-adapter changes (route bound via closure in `createBullBoard`).
- **@bull-board/metrics package (recorder + Redis provider)** → Tasks 4-10.
- **Per-queue + global rollup** → Task 7 writes `__global__`, Task 9 reads it.
- **Retention via TTL (default 90d)** → Task 7 (`ttlSeconds`), Task 8/9 defaults.
- **Daily granularity for long tail + hourly recent** → Task 9 implements both.
- **UI range selector on existing chart, hidden without provider** → Task 12, gated on `hasHistoryProvider`.
- **Cross-queue global view (the #258 wallboard)** → Task 13.
- **Precondition: workers need native metrics** → documented in README (Task 4) and enforced in tests/example (Tasks 8, 14).
- **Opt-in, zero-cost when off** → Task 3 (route absent, flag false), verified by the "returns 404 when no historyProvider" test.

Open design questions resolved: storage encoding = per-day minute hash + maintained daily totals (Task 7); finer granularity = hourly implemented now (Task 9); interface location = `packages/api` typings (Task 1). Snapshotter downtime guidance = document `MetricsTime.ONE_WEEK` in README (Task 4).

Out of scope (Phase 2, not in this plan): alerting, depth/backlog gauges over time, latency percentiles, Bull legacy support, Prometheus/OTel export, dedicated dashboard widgets beyond the single global card.
