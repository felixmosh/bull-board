# Hono

[Hono](https://hono.dev/). `@bull-board/hono` gives you a Hono sub-app.

## Install

```sh
npm install @bull-board/api @bull-board/hono @hono/node-server
```

`@hono/node-server` is only for Node.js. On Bun, Deno, or Workers bring your own serve function, see the [Hono docs](https://hono.dev/docs/getting-started/basic).

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { HonoAdapter } from '@bull-board/hono';
import { Queue } from 'bullmq';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

const queue = new Queue('my-queue', {
  connection: { host: 'localhost', port: 6379 },
});

const app = new Hono();

const serverAdapter = new HonoAdapter(serveStatic);

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter,
});

const basePath = '/ui';
serverAdapter.setBasePath(basePath);
app.route(basePath, serverAdapter.registerPlugin());

serve({ fetch: app.fetch, port: 3000 });
```

`serve` and `serveStatic` depend on the runtime, check the example for Node, Bun, Deno variants. `HonoAdapter` takes the runtime's `serveStatic` helper in the constructor so it can serve the bundled UI assets.

## Full runnable example

- Simple setup: [`examples/with-hono`](https://github.com/felixmosh/bull-board/tree/master/examples/with-hono)

## Next steps

- [UIConfig](/configuration/ui-config): title, logo, locale, polling.
- [Read-only mode](/recipes/read-only-mode): disable destructive actions.
- [Visibility guard](/recipes/visibility-guard): scope visible queues per request.
- [Formatters](/recipes/formatters): rewrite job fields for the UI.
