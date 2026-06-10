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
| `allowRetries` | `boolean` | `true` | Shows or hides the retry buttons. Ignored when `readOnlyMode` is `true`. |
| `description` | `string` | `''` | Queue description text displayed in the UI. |
| `displayName` | `string` | `''` | Overrides the queue name shown in the UI. |
| `prefix` | `string` | `''` | Prepended to job names in the UI. |
| `delimiter` | `string` | `''` | Delimiter between the prefix and the job name. |

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

The flow tree tab on the job detail page works with `BullMQAdapter` queues. Enable it by passing a flow producer to `createBullBoard`:

```ts
import { FlowProducer } from 'bullmq';
import { createBullBoard } from '@bull-board/api';

createBullBoard({
  queues: [new BullMQAdapter(myQueue)],
  serverAdapter,
  options: {
    uiConfig: { /* ... */ },
  },
  flowProducer: new FlowProducer({ connection: { host: 'localhost', port: 6379 } }),
});
```
