# Your first dashboard

Express and BullMQ. Every other adapter follows the same three-step shape, see the [adapter pages](/adapters/) for specifics.

## 1. Create the queue

::: code-group

```ts [queues.ts]
import { Queue } from 'bullmq';

export const emailQueue = new Queue('emails', {
  connection: { host: 'localhost', port: 6379 },
});
```

:::

## 2. Mount the dashboard

```ts
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from './queues';

const app = express();

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());

app.listen(3000, () => {
  console.log('Dashboard: http://localhost:3000/admin/queues');
});
```

::: tip
`setBasePath` and the `app.use` mount path must match. Change one, change the other, otherwise asset and API URLs will 404.
:::

## 3. Open the dashboard

Start the server and visit `http://localhost:3000/admin/queues`. You'll see the `emails` queue with counts, an empty job list, and a live-updating header.

Add a job:

```ts
await emailQueue.add('welcome', { to: 'you@example.com' });
```

## Where to next

- Add more queues: pass them to `createBullBoard({ queues: [...] })` or call `addQueue()` at runtime.
- Lock the dashboard with [read-only mode](/recipes/read-only-mode).
- Scope queues per tenant with a [visibility guard](/recipes/visibility-guard).
- Change title, logo, polling via [UIConfig](/configuration/ui-config).
- Rewrite job fields for the UI with [formatters](/recipes/formatters).
