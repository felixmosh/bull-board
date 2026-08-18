# @bull-board/metrics

> Status: Beta. The API and Redis storage layout may still change in a minor release while the feature settles. It is safe to run (opt-in, and it only writes its own namespaced keys), but pin an exact version if you depend on the storage format.

Opt-in long-retention historical job metrics for [bull-board](https://github.com/felixmosh/bull-board).

Snapshots native BullMQ per-minute metrics into long-retention Redis buckets and exposes a
`MetricsHistoryProvider` that feeds bull-board's history charts. Everything is opt-in: the core
`@bull-board/api` stays stateless.

## Precondition

Your BullMQ workers must have native metrics enabled, with a window large enough to survive any
recorder downtime, for example:

    new Worker(name, processor, {
      connection,
      metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
    });

## Usage

    import { MetricsRecorder, RedisMetricsHistoryProvider } from '@bull-board/metrics';

    // In your always-on worker/app process:
    const recorder = new MetricsRecorder({
      queues: [new BullMQAdapter(queue)],
      connection,
      retentionDays: 90,
    });
    recorder.start();

    // Where you build the board:
    createBullBoard({
      queues,
      serverAdapter,
      options: { historyProvider: new RedisMetricsHistoryProvider({ connection }) },
    });

On shutdown, call `recorder.stop()` and `provider.disconnect()`. Both only close the Redis connection if the recorder/provider opened it internally, so it's a safe no-op if you passed in your own `Redis` instance.

`connection` may be ioredis options or a `Redis` instance you created. `ioredis` is a peer dependency (v5 or v6): resolve a single copy in your app, and if you reuse an existing client, pass one built from that same `ioredis` — a client from a different install (for example one created internally by a BullMQ pinned to a different ioredis major) is not recognized as a `Redis` instance and would be misread as options.

Timestamps and buckets are UTC.

## Job latency

Alongside the completed/failed counters, the recorder tracks two histograms per queue: wait time (`processedOn - timestamp`, how long a job sat before a worker picked it up) and run time (`finishedOn - processedOn`, how long the handler took). They diagnose different problems, so they're kept separate rather than combined into one number.

Both are collected by scanning the completed and failed sorted sets (BullMQ scores them by finish time via `moveToFinished`'s `ZADD`) past a watermark on the recorder's existing tick, so no worker changes are needed and there's no precondition on `queue.getMetrics()`.

The wait histogram only sees jobs that finished, so it goes quiet exactly when a queue is backed up and jobs stop finishing. A queue-age gauge (oldest job still waiting) is recorded alongside it for that reason, and the UI overlays it on the wait chart. Retries are excluded from wait time only, since `timestamp` is a job's creation but `processedOn` is its latest attempt. Percentiles are estimates bounded by bucket width; the bucket layout is fixed, not configurable, because two ranges with different layouts can't be merged into one percentile.

`removeOnComplete: true` deletes jobs the instant they finish, so there's nothing left to scan; that queue will never show latency data. Deleting, cleaning, or retrying jobs by hand does the same to whatever finished since the last tick. The counter charts are unaffected, since BullMQ counts a job as it finishes and never decrements when it is removed. Latency sampling is on by default; set `latency: false` on `MetricsRecorder` to turn it off.

## PostgreSQL-backed queues

A BullMQ 6 queue backed by PostgreSQL records no history. Its `getMetrics()` reports `prevTS` as 0, which leaves the per-minute buffer undatable, so the counters are dropped rather than dated from the recorder's clock; the field is tracked in the backend's schema, so this may resolve upstream. Latency sampling needs BullMQ's Redis keys, which such a queue does not have, so it is skipped rather than recorded as an empty backlog. Redis-backed queues on the same board are unaffected.

## Storage

Every key lives under `bull-board:metrics:`. Each snapshot is written at three resolutions at once, each with its own retention, because they cost very different amounts:

| Tier | Default retention | Size per busy day, per queue and metric |
| --- | --- | --- |
| Minute | 7 days | ~72 KB |
| Hour | 90 days | ~0.3 KB |
| Day | 90 days | ~15 bytes |

At the defaults that's roughly 1.1 MB for a queue busy every minute of every day across both metrics, and far less for a bursty one. Minutes with no activity are never written, so the footprint follows how busy a queue is, not how long it has been recording.

    const recorder = new MetricsRecorder({
      queues,
      connection,
      retention: { minutes: 7, hours: 90, days: 90 },
    });

The minute window is the one worth tuning: it holds essentially all the bytes, and it doubles as the recorder's catch-up window after downtime. `retentionDays: N` still works and sets the hourly and daily windows, leaving the minute window at its default.

Latency histograms and the queue-age gauge use a separate packed format and are measured separately, at 90 day retention:

| Scenario | Measured |
| --- | --- |
| One queue, both histograms plus the queue-age gauge, realistic distribution | 254.5 KB |
| Same, pathological: all 18 buckets populated heavily every hour | 574.6 KB |
| Shared `__global__` cross-queue rollup | ~224 KB once, for the whole board |

That rollup is a single shared cost, not multiplied per queue: 200 queues at typical traffic is roughly 200 × 254.5 KB, about 50 MB, plus the one shared 224 KB rollup. `sample()` takes about 9.11 ms per tick at 1000 finished jobs and about 12 Redis round trips per queue per tick, flat in job count; a subsampling cap above `maxLatencySamplesPerTick` keeps that bounded even at 10,000 jobs a tick.

Retention is enforced by Redis. Day-scoped keys expire on their own TTL; the daily totals hashes are trimmed to the window as each new day rolls in.

## Inspecting and clearing history

    import { MetricsHistoryAdmin } from '@bull-board/metrics';

    const admin = new MetricsHistoryAdmin({ connection });

    await admin.stats();                          // bytes per tier and per queue, day range
    await admin.purge();                          // delete everything
    await admin.purge({ queue: 'mailer' });       // delete one queue
    await admin.purge({ before: '2026-06-01' });  // delete anything older than a day

Both are `SCAN`-driven and confined to this package's namespace, so they never block Redis and never touch BullMQ's own keys. Purging a single queue also subtracts it from the cross-queue rollup. Call `admin.disconnect()` when done.

`RedisMetricsHistoryProvider` exposes the same two operations to the board, which turns them into a storage panel on the Metrics history page with a confirmation before anything is deleted.

## Scope

The shipped bull-board UI reads daily rollups. `getHistory` also supports hourly granularity for custom consumers (via the core's `/api/metrics/history` endpoint), though the built-in charts don't use it.
