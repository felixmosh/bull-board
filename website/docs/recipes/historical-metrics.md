# Historical metrics

> Applies to: BullMQ only.

:::warning Beta
This ships in the opt-in `@bull-board/metrics` package. The API and the Redis storage layout may still change in a minor release, so pin an exact version if you depend on the storage format.
:::

The built-in throughput chart reads BullMQ's `queue.getMetrics()`, a per-minute buffer that only reaches back as far as `maxDataPoints` and only covers one queue. `@bull-board/metrics` copies those points into Redis before they roll off, so the board can chart up to 90 days per queue and across all queues, along with wait time, run time and queue age.

It has two parts. `MetricsRecorder` runs in an always-on process, usually next to your workers, and writes the history. `RedisMetricsHistoryProvider` is passed to `createBullBoard` and reads it back. With no provider configured, the board behaves exactly as before.

:::tip Using the CLI or the Docker image?
`--history` runs both parts in the same process, so there is nothing to wire up. See [CLI](/guide/cli) and [Docker](/guide/docker). Add `--read-only` to keep the charts and skip recording, for when your workers already record.
:::

## Setup

### 1. Turn on native metrics in your workers

The recorder copies what BullMQ already counts, so workers need metrics enabled:

```ts
import { Worker, MetricsTime } from 'bullmq';

const worker = new Worker(name, processor, {
  connection,
  metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
});
```

Without this the throughput charts stay empty. A one-week buffer lets the recorder catch up after up to a week of downtime. Latency charts don't need it.

### 2. Install

```bash
yarn add @bull-board/metrics
```

`ioredis` is a peer dependency, which you already have with BullMQ.

### 3. Start the recorder

```ts
import { MetricsRecorder } from '@bull-board/metrics';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

const recorder = new MetricsRecorder({
  queues: [new BullMQAdapter(myQueue)],
  connection: redisOptions,
});
recorder.start();

// on shutdown
recorder.stop();
```

If your queues change at runtime, pass a function instead, `queues: () => currentAdapters`, and it is read again on every tick.

You can run the recorder in several processes and restart it freely. Each minute is written idempotently, so nothing is counted twice.

### 4. Register the provider

```ts
import { createBullBoard } from '@bull-board/api';
import { RedisMetricsHistoryProvider } from '@bull-board/metrics';

const historyProvider = new RedisMetricsHistoryProvider({ connection: redisOptions });

createBullBoard({
  queues,
  serverAdapter,
  options: {
    uiConfig: { showMetrics: true },
    historyProvider,
  },
});

// on shutdown
historyProvider.disconnect();
```

`showMetrics: true` is what shows the chart on each queue page. The Metrics history page appears without it.

`stop()` and `disconnect()` only close a Redis connection the object opened itself. If you passed in your own client, it stays open.

## What you get in the UI

Each queue's chart gains a range selector: 60m, 7d, 30d and 90d. 60m is the live BullMQ buffer, as before, and the longer ranges read from the history.

![Queue metrics chart with the 60m / 7d / 30d / 90d range selector](/screenshots/historical-metrics-range.png)

A **Metrics history** page appears in the sidebar. It charts completed and failed jobs across every queue, with a table underneath ranking the queues by runs and showing each one's failure rate.

![The dedicated Metrics history page showing cross-queue throughput](/screenshots/historical-metrics-page.png)

Both charts have a Latency tab next to Throughput, described below. The newest point is drawn dashed while its day or hour is still in progress.

## Job latency

The recorder also tracks three durations per queue:

| Metric | Measures | A rise usually means |
| --- | --- | --- |
| Wait time | From when a job became due until a worker picked it up | You need more workers |
| Run time | `finishedOn - processedOn` | The handler got slower |
| Queue age | How long the oldest waiting job has been due | The queue is stuck or backed up |

A job added straight to the queue is due at its `timestamp`. A delayed job, and every run created by a job scheduler, is due at `timestamp` plus its delay, so an hourly cron shows how late each run started.

Wait and run time come from finished jobs, so a stalled queue would look the same as an idle one. Queue age covers that case because it reads the backlog directly, and the chart draws it as a dashed line over wait time.

![Runtime and wait time percentiles on a queue page, with the oldest waiting job overlaid on the wait chart](/screenshots/job-latency-queue.png)

p95 is shown by default and p50 and p99 can be switched on from the legend. The axis is logarithmic. Retried jobs count towards run time but are left out of wait time, because their wait would include every earlier attempt and the backoff between them.

Percentiles are estimates read from fixed histogram buckets, accurate to the width of the bucket a value falls in.

:::warning No latency data with `removeOnComplete: true`
Latency is read from the completed and failed sets on each tick. A queue that removes jobs as soon as they finish leaves nothing to read, so its latency chart stays empty, with no error. Cleaning or deleting jobs by hand can lose up to one tick of samples in the same way. Throughput charts are unaffected.
:::

Latency sampling is on by default. Turn it off with `latency: false` on the recorder.

### Seeing errors

The recorder never throws from its own timer, so a broken setup looks like a quiet board. Pass these to see failures:

```ts
const recorder = new MetricsRecorder({
  queues,
  connection: redisOptions,
  onSnapshotError: (error, queueName) => logger.error({ error, queueName }),
  onLatencyError: (error, queueName) => logger.error({ error, queueName }),
});
```

A failing queue is skipped for that tick and the others are still recorded. Calling `recorder.snapshot()` yourself rejects with the first failure.

## Storage footprint

History is written to the same Redis as your queues, under `bull-board:metrics:`, and Redis TTLs remove old data, so there is nothing to prune. Every minute is stored at three resolutions, each with its own retention:

| Tier | Default retention | Busy day, per queue and metric |
| --- | --- | --- |
| Minute | 7 days | ~72 KB |
| Hour | 90 days | ~0.3 KB |
| Day | 90 days | ~15 bytes |

At the defaults, throughput history for completed and failed together costs, per queue:

| Queue | Size |
| --- | --- |
| Busy every minute | ~1.1 MB |
| Active a tenth of the time | ~120 KB |
| Idle | ~0 |

Latency history adds about 255 KB per queue at typical traffic, and up to about 575 KB if every histogram bucket fills every hour. The cross-queue totals cost about as much as one queue carrying all the traffic, plus about 224 KB for latency, once for the whole board. 200 queues at typical traffic come to about 50 MB of latency history on top of their throughput history.

:::details Why three tiers
The minute tier costs about 240 times as much as the hourly one for the same day, and the charts only read the daily totals. Writing all three at once, from the same atomic script, means the expensive tier can be kept short without a compaction job, and the tiers can never disagree. Keeping 90 days of minutes would cost about 15 MB per queue.
:::

### Retention

```ts
const recorder = new MetricsRecorder({
  queues,
  connection: redisOptions,
  retention: { minutes: 7, hours: 90, days: 90 },
});
```

Values are in days and each one is optional. Pass the same `retention` to `RedisMetricsHistoryProvider`. `retentionDays: N` is a shorthand that sets the hourly and daily windows to `N` and caps minutes at 7.

The minute window is the one that matters for size, and it is also how far back the recorder can catch up after downtime. Keep it no longer than your workers' `maxDataPoints`. Dropping it to 1 day takes a busy queue from ~1.1 MB to ~200 KB.

### Sharing one Redis between boards

Set `prefix` to give each board its own namespace, and pass the same prefix to the provider and to `MetricsHistoryAdmin`:

```ts
new MetricsRecorder({ queues, connection, prefix: 'staging:metrics' });
```

A provider pointed at the wrong prefix shows empty history rather than an error.

## Managing stored history

### From the board

When the provider supports it, as `RedisMetricsHistoryProvider` does, the actions menu on the Metrics history page has a **Storage** entry. It shows the footprint by tier and by queue, and offers two actions:

- **Keep only the last 7d / 30d / 90d** deletes everything older than the selected range.
- **Clear all history** deletes everything.

![The Storage modal showing the footprint split by tier and by queue](/screenshots/historical-metrics-storage.png)

Recording continues afterwards, and deleted data does not come back when the recorder restarts. The actions are hidden when every queue is in `readOnlyMode`.

:::info Purging a single queue
The cross-queue total is corrected by subtracting that queue's stored values. If some of those keys were already gone, for example removed by hand, part of the queue can stay in the total. Clearing all history resets it.
:::

### From code

`MetricsHistoryAdmin` offers the same operations for scripts and debug endpoints:

```ts
import { MetricsHistoryAdmin } from '@bull-board/metrics';

const admin = new MetricsHistoryAdmin({ connection: redisOptions });

const stats = await admin.stats(); // bytes and keys per tier and per queue

await admin.purge(); // everything
await admin.purge({ queue: 'mailer' }); // one queue
await admin.purge({ before: '2026-06-01' }); // days before a date
await admin.purge({ queue: 'mailer', before: new Date('2026-06-01') });

admin.disconnect();
```

Both use `SCAN`, so they never block Redis and never touch your queues' keys. `stats()` reads every history key, so call it on demand rather than polling it.

## Redis Cluster

Pass a `Cluster` as `connection` and everything works. On a cluster the namespace is wrapped in a [hash tag](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/#hash-tags) so all history lands in one slot:

```ts
new MetricsRecorder({ queues, connection: cluster }); // {bull-board:metrics}
new MetricsRecorder({ queues, connection: cluster, prefix: 'staging' }); // {staging}
new MetricsRecorder({ queues, connection: cluster, prefix: '{eu}:metrics' }); // {eu}:metrics
```

A prefix that already has a `{...}` tag is used as given. One master holds the whole board's history, sized as in [Storage footprint](#storage-footprint).

For latency, your queues also need the hash-tagged prefix BullMQ requires on a cluster, such as `new Queue(name, { prefix: '{bull}' })`. Without it latency sampling fails silently, so pass `onLatencyError` to see it.

:::details Why one slot
Each write updates a queue's keys and the cross-queue keys in one script, which is what keeps every tier consistent and idempotent. Redis Cluster only allows that when all the keys share a slot.
:::

History recorded on a standalone Redis does not carry over to a cluster, since the key names differ.

## PostgreSQL-backed queues

:::warning No history for PostgreSQL queues
BullMQ 6 queues backed by PostgreSQL record nothing. Their metrics come without the timestamp that dates each minute, and latency is read from Redis structures they don't have. The charts stay empty, with no error. Redis-backed queues on the same board record normally.
:::

## Scope

BullMQ only, since Bull v3 has no native metrics. Completed and failed throughput, wait time, run time and queue age are recorded. Other job states and job data are not. The charts read daily totals; hourly data is available to custom clients through `/api/metrics/history` with `granularity: 'hour'`.
