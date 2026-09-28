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

From BullMQ 6.1 the Postgres backend no longer creates its schema on connect, so a queue fails with `SchemaMigrationRequiredError` against a database the migrations have not run on. Normally the application that owns the queues runs them. If the board is the first thing to connect, pass `{ connectionString, migrate: true }` as the connection instead of the bare URL.

::: tip
`ioredis` is an optional peer dependency of BullMQ v6, so a Postgres-only app does not need it installed.
:::

## What the dashboard shows

Job listing, counts, adding, retrying, cleaning, pausing, promoting, flows and the schedulers view all behave exactly as they do on Redis.

One panel is Redis-specific and adapts:

**Datastore details** reports what Postgres can answer, and retitles itself:

| | |
|---|---|
| Version | 17.10 |
| Up time | 3 days |
| Connected clients | 6 |
| Blocked clients | 0 |
| Port | 5432 |

Memory usage, peak memory, fragmentation ratio and replication mode are left out rather than filled with a number that means something else. `pg_database_size` measures disk, not memory.

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
