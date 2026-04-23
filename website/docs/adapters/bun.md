# Bun

[Bun](https://bun.sh/). `@bull-board/bun` targets Bun's native HTTP server.

## Install

```sh
bun add @bull-board/api @bull-board/bun
```

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BunAdapter } from '@bull-board/bun';
import { Queue } from 'bullmq';

const queue = new Queue('my-queue', {
  connection: { host: 'localhost', port: 6379 },
});

const serverAdapter = new BunAdapter();
serverAdapter.setBasePath('/ui');

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter,
});

const bullBoardRoutes = serverAdapter.getRoutes();

Bun.serve({
  port: 3000,
  routes: {
    '/health': { GET: () => Response.json({ status: 'ok' }) },
    ...bullBoardRoutes,
  },
});
```

`getRoutes()` returns an object shaped for `Bun.serve({ routes })`. Spread it alongside your own routes, no separate router to mount.

## Full runnable example

- Simple setup: [`examples/with-bun`](https://github.com/felixmosh/bull-board/tree/master/examples/with-bun)

## Next steps

- [UIConfig](/configuration/ui-config): title, logo, locale, polling.
- [Read-only mode](/recipes/read-only-mode): disable destructive actions.
- [Visibility guard](/recipes/visibility-guard): scope visible queues per request.
- [Formatters](/recipes/formatters): rewrite job fields for the UI.
