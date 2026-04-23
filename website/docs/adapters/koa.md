# Koa

[Koa](https://koajs.com/). `@bull-board/koa` gives you middleware to mount on your app.

## Install

```sh
npm install @bull-board/api @bull-board/koa
```

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { KoaAdapter } from '@bull-board/koa';
import { Queue } from 'bullmq';
import Koa from 'koa';

const queue = new Queue('my-queue', {
  connection: { host: 'localhost', port: 6379 },
});

const app = new Koa();

const serverAdapter = new KoaAdapter();

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter,
});

serverAdapter.setBasePath('/ui');
app.use(serverAdapter.registerPlugin());

app.listen(3000);
```

`registerPlugin()` returns Koa middleware. Mount it after `setBasePath()`.

## Full runnable example

- Simple setup: [`examples/with-koa`](https://github.com/felixmosh/bull-board/tree/master/examples/with-koa)

## Next steps

- [UIConfig](/configuration/ui-config): title, logo, locale, polling.
- [Read-only mode](/recipes/read-only-mode): disable destructive actions.
- [Visibility guard](/recipes/visibility-guard): scope visible queues per request.
- [Formatters](/recipes/formatters): rewrite job fields for the UI.
