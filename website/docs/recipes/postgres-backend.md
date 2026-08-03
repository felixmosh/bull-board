# PostgreSQL backend

BullMQ v6 can store queues in PostgreSQL instead of Redis. bull-board reads those queues the same way it reads Redis ones, so there is nothing extra to configure on the board.

## Setup

Install `pg` alongside BullMQ v6, then pass `createPostgresBackend` as the third argument to `Queue`:

```js
const express = require('express');
const { Queue, createPostgresBackend } = require('bullmq');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const connection = 'postgres://user:password@localhost:5432/bullmq';

const emails = new Queue('emails', { connection }, createPostgresBackend);

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emails)],
  serverAdapter,
});

const app = express();
app.use('/admin/queues', serverAdapter.getRouter());
app.listen(3000);
```

That is the whole difference: the third argument on `Queue`. `BullMQAdapter` takes the queue as it always has.

::: tip
`ioredis` is an optional peer dependency of BullMQ v6, so a Postgres-only app does not need it installed.
:::

## What the dashboard shows

Job listing, counts, adding, retrying, cleaning, pausing, promoting and the schedulers view all behave exactly as they do on Redis.

Two panels are Redis-specific and adapt:

**Datastore details** reports what Postgres can answer, and retitles itself:

| | |
|---|---|
| Version | 17.10 |
| Up time | 3 days |
| Connected clients | 6 |
| Blocked clients | 0 |
| Port | 5432 |

Memory usage, peak memory, fragmentation ratio and replication mode are left out rather than filled with a number that means something else. `pg_database_size` measures disk, not memory.

**Flow tree** needs a `FlowProducer`, which needs a Redis connection, so the tab reports that a job is not part of a flow instead of erroring.

## Mixing backends

A single board can hold Redis-backed and Postgres-backed queues at once. Each queue answers for itself:

```js
createBullBoard({
  queues: [
    new BullMQAdapter(new Queue('emails', { connection: pgConnection }, createPostgresBackend)),
    new BullMQAdapter(new Queue('reports', { connection: { host: 'localhost', port: 6379 } })),
  ],
  serverAdapter,
});
```

The datastore details panel describes the first registered queue, so put the one you care about first if you mix them.

## Not covered

[`@bull-board/metrics`](/recipes/historical-metrics) is Redis-only. It scans Redis sorted sets directly to build throughput and latency history, so it has no Postgres implementation yet. Everything else on the board works.
