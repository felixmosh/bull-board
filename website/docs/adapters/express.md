# Express

[Express.js](https://expressjs.com/). `@bull-board/express` mounts as a sub-router under any path.

## Install

```sh
npm install @bull-board/api @bull-board/express
```

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import express from 'express';

const queue = new Queue('my-queue', {
  connection: { host: 'localhost', port: 6379 },
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter,
});

const app = express();
app.use('/admin/queues', serverAdapter.getRouter());
app.listen(3000);
```

The path in `setBasePath()` must match the mount point in `app.use()`.

## Full runnable examples

- Simple setup: [`examples/with-express`](https://github.com/felixmosh/bull-board/tree/master/examples/with-express)
- With basic auth: [`examples/with-express-auth`](https://github.com/felixmosh/bull-board/tree/master/examples/with-express-auth)
- With CSRF: [`examples/with-express-csrf`](https://github.com/felixmosh/bull-board/tree/master/examples/with-express-csrf)
- Multiple dashboard instances: [`examples/with-multiple-instances`](https://github.com/felixmosh/bull-board/tree/master/examples/with-multiple-instances)

## Next steps

- [UIConfig](/configuration/ui-config): title, logo, locale, polling.
- [Read-only mode](/recipes/read-only-mode): disable destructive actions.
- [Visibility guard](/recipes/visibility-guard): scope visible queues per request.
- [Formatters](/recipes/formatters): rewrite job fields for the UI.
