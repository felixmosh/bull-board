# BullMQAdapter

For the [BullMQ](https://docs.bullmq.io/) queue library.

## Import

```ts
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
// or
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
```

## Usage

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';

const myQueue = new Queue('my-queue', {
  connection: { host: 'localhost', port: 6379 },
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(myQueue)],
  serverAdapter,
});
```

## Options

All options are optional.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `readOnlyMode` | `boolean` | `false` | Hides all queue and job actions. |
| `allowRetries` | `boolean` | `true` | Shows or hides the retry buttons on **failed** jobs. Forced to `false` when `readOnlyMode` is `true`. |
| `allowCompletedRetries` | `boolean` | `true` | Shows or hides the retry button on **completed** jobs. Only takes effect when `allowRetries` is `true`. |
| `description` | `string` | `''` | Queue description text displayed in the UI. |
| `displayName` | `string` | `''` | Overrides the queue name shown in the UI. |
| `prefix` | `string` | `''` | Prepended to job names in the UI. |
| `delimiter` | `string` | `''` | Delimiter between the prefix and the job name. |
| `externalJobUrl` | `(job) => { href, displayText? }` | none | Links each job card to a page in your own app. See [External job URLs](/recipes/external-job-url). |

## Instance methods

```ts
adapter.setFormatter('name', (job) => `#${job.name}`);
adapter.setFormatter('data', (data) => redact(data));
adapter.setFormatter('returnValue', (value) => redact(value));
adapter.setFormatter('progress', (progress) => `${Math.round(progress)}%`);

adapter.setVisibilityGuard((request) => {
  // return true to show this queue, false to hide it
  return request.headers['x-tenant-id'] === 'acme';
});
```

## Flow tree

The flow tree tab on the job detail page works with `BullMQAdapter` queues automatically. There's nothing to configure. When you open a job that belongs to a [BullMQ flow](https://docs.bullmq.io/guide/flows), bull-board reads the parent/child graph and renders it.

It builds a `FlowProducer` from the Redis connection of a registered `BullMQAdapter` (cached per connection), then walks the job's parent chain across queues to find the flow root. So it works as long as every queue in the flow is registered on the board.

::: tip
The flow tree only spans queues bull-board knows about. If a parent job lives in a queue you didn't pass to `createBullBoard`, the tree stops at the boundary. Register every queue that participates in the flow.
:::

Bull (the legacy library) has no flows, so the tab is BullMQ-only.
