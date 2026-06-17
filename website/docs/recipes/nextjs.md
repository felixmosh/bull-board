# Next.js & Vercel

There is no dedicated Next.js adapter — bull-board runs inside a Next.js API
route using an existing adapter. Two runnable examples:

- [`examples/with-nextjs-app`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nextjs-app) — App Router, `@bull-board/hono` adapter.
- [`examples/with-nextjs-pages`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nextjs-pages) — Pages Router, `@bull-board/express` adapter.

Both deploy to Vercel. The mounting differs by router; the Vercel-specific
config is identical and is the part most people miss.

## App Router (Hono)

A single optional catch-all Route Handler at
`app/api/queues/[[...path]]/route.ts`:

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { HonoAdapter } from '@bull-board/hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { queue } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const basePath = '/api/queues';
const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath(basePath);

createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

const app = new Hono();
app.route(basePath, serverAdapter.registerPlugin());

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
```

## Pages Router (Express)

A single optional catch-all API route at `pages/api/queues/[[...path]].ts` that
delegates to an Express router. Disable `bodyParser` and enable
`externalResolver` so Express owns the response:

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';
import { queue } from '../../../lib/queue';

const basePath = '/api/queues';
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(basePath);

createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

const app = express();
app.use(basePath, serverAdapter.getRouter());

export const config = { api: { bodyParser: false, externalResolver: true } };

export default function handler(req, res) {
  return app(req, res);
}
```

## The Vercel fix (both routers)

`@bull-board/api` finds the UI's compiled assets with
`eval(require.resolve('@bull-board/ui/package.json'))`. The `eval` deliberately
hides the require from bundlers — and that includes Next.js's static file tracer
([`@vercel/nft`](https://github.com/vercel/nft)). On Vercel the UI files are
never copied into the function, so you get:

```
Error: Cannot find module '@bull-board/ui/package.json'
```

Fix it in `next.config.js`:

```js
/** @type {import('next').NextConfig} */
module.exports = {
  // Resolve bull-board and bullmq from node_modules at runtime, not from the bundle.
  serverExternalPackages: ['@bull-board/api', '@bull-board/ui', 'bullmq'],

  // Force the compiled UI into the serverless function (the tracer can't see the eval).
  outputFileTracingIncludes: {
    '/api/queues/*': ['./node_modules/@bull-board/ui/dist/**/*'],
  },
};
```

::: warning Monorepo
If `node_modules` is hoisted to a workspace root (e.g. `apps/web` in a Turborepo),
add `outputFileTracingRoot: path.join(__dirname, '../../')` so the included paths
resolve from the right place.
:::

`serverExternalPackages` and `outputFileTracingIncludes` are stable top-level
options in **Next.js 15+** (in 13/14 they lived under `experimental`).

### Alternative: `uiBasePath`

Instead of the trace config you can tell bull-board where the UI lives directly,
skipping the `eval(require.resolve(...))` entirely:

```ts
createBullBoard({
  queues,
  serverAdapter,
  options: { uiBasePath: 'node_modules/@bull-board/ui' },
});
```

You still need `outputFileTracingIncludes` so the files are actually deployed —
this only changes how the path is resolved, not whether the files are present.

## Workers

BullMQ workers are long-running and **cannot** run inside serverless functions.
Next.js (the dashboard and any job-producing routes) deploys to Vercel; the
worker runs as a separate always-on process — a container, a VM, or a dedicated
worker service. Both examples ship a standalone `worker.ts` for local
processing.
