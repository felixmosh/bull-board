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

Timestamps and buckets are UTC.

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
