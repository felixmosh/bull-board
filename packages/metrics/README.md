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

Every key lives under `bull-board:metrics:` and is bounded by `retentionDays` (default 90): per-day hashes expire on their own TTL, and the daily totals hashes are trimmed to the same window. Minutes with no activity are never written, so the footprint follows how busy a queue is, not how long it has been recording. A queue busy every minute of every day costs roughly 15 MB at 90 days across both metrics; a bursty one costs a fraction of that.

## Inspecting and clearing history

    import { MetricsHistoryAdmin } from '@bull-board/metrics';

    const admin = new MetricsHistoryAdmin({ connection });

    await admin.stats();                          // per-queue keys, bytes, minutes, day range
    await admin.purge();                          // delete everything
    await admin.purge({ queue: 'mailer' });       // delete one queue
    await admin.purge({ before: '2026-06-01' });  // delete anything older than a day

Both are `SCAN`-driven and confined to this package's namespace, so they never block Redis and never touch BullMQ's own keys. Purging a single queue also subtracts it from the cross-queue rollup. Call `admin.disconnect()` when done.

## Scope

The shipped bull-board UI reads daily rollups. `getHistory` also supports hourly granularity for custom consumers (via the core's `/api/metrics/history` endpoint), though the built-in charts don't use it.
