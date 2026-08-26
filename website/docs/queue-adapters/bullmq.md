# BullMQAdapter

For the [BullMQ](https://docs.bullmq.io/) queue library.

## Supported versions

`@bull-board/api` declares its BullMQ peer as `^5.56.0 || ^6.0.0`, and the adapter figures out which one it is holding. Nothing to configure.

Two v6 changes are visible in the dashboard:

- **No Paused tab.** v6 removed the paused job state. A paused queue's jobs are stored as `waiting`, so that is where the dashboard shows them. The queue still displays its paused banner and the pause and resume buttons still work.
- **PostgreSQL queues are supported.** v6 can run on Postgres instead of Redis. See [PostgreSQL backend](/recipes/postgres-backend).

### Support policy

Three BullMQ versions run the full `@bull-board/api` suite on every commit:

| Tested version | Why |
|---|---|
| `5.56.0` | The exact lower bound of the peer range, pinned with no caret. |
| latest `5.x` | The version most installs resolve to. |
| latest `6.x` | The current major. |

The lower bound is a tested claim rather than a guess: `packages/api/jest.config.bullmq-floor.js` refuses to run if the pinned alias and the declared peer range disagree, so the range cannot be widened without the suite following it down.

Below `5.56.0` the dashboard still starts and still lists, inspects and retries jobs, but three things break, which is why the range stops where it does. Job schedulers report `every` as a string instead of a number, so the interval column is wrong and the previous run cannot be named. Rewriting a schedule from an interval to a cron pattern leaves the old interval behind in Redis, so the scheduler ends up storing both. Versions before 5.41 have no `Queue#removeGlobalConcurrency`, so clearing a global concurrency limit silently does nothing.

Anything at or above `5.56.0` gets every feature. If you are pinned lower and something on that list matters to you, open an issue rather than assuming the floor is fixed: it is set by what CI can prove, and it moves down whenever a fix makes a lower version pass.

Raising the floor is a breaking change and only happens in a major release of `@bull-board/api`.

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

It walks the job's parent chain across queues to find the flow root, then reads the tree through a `FlowProducer` that shares the root queue's connection (on BullMQ v6 it reuses the queue's backend, so queues on the [PostgreSQL backend](/recipes/postgres-backend) work too). So it works as long as every queue in the flow is registered on the board.

::: tip
The flow tree only spans queues bull-board knows about. If a parent job lives in a queue you didn't pass to `createBullBoard`, the tree stops at the boundary. Register every queue that participates in the flow.
:::

Bull (the legacy library) has no flows, so the tab is BullMQ-only.
