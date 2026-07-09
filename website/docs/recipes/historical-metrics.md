# Historical metrics

> Applies to: BullMQ only.
>
> Beta: this feature ships in the opt-in `@bull-board/metrics` package. It is safe to run, but the API and Redis storage layout may still change in a minor release while it settles, so pin an exact version if you depend on the storage format.

bull-board is a viewer, not a monitor, and its built-in throughput chart reflects that: it reads BullMQ's native `queue.getMetrics()`, a per-minute ring buffer capped at `maxDataPoints`, scoped to a single queue, and only as deep as that buffer's window. Restart the buffer's window, or just wait long enough, and the older points are gone. There's no long history and no cross-queue total, because BullMQ was never asked to keep one.

`@bull-board/metrics` is an opt-in companion package that fills that gap. It doesn't replace the live chart, it adds a second, longer-retention path behind it: a recorder that snapshots the native metrics into Redis before they roll off, and a history provider you register with `createBullBoard` that lets the UI read them back.

## How it fits together

Two pieces, living in two different places.

`MetricsRecorder` runs in your own always-on process, typically wherever your workers already live. On an interval, it reads each queue's native completed/failed per-minute metrics and writes them into long-retention Redis buckets: a daily rollup per queue, plus a cross-queue global rollup. Writes are idempotent by minute, so it's safe to run the recorder in several processes, or restart it, without double-counting. There's no singleton to coordinate and no leader election.

`RedisMetricsHistoryProvider` runs wherever you build the board. You pass it to `createBullBoard({ options: { historyProvider } })`. The core itself only defines the `MetricsHistoryProvider` interface and stays stateless: registering a provider just turns on one additional read endpoint that delegates to it. `@bull-board/metrics` is the batteries-included Redis implementation, but if you already have a metrics store of your own, you can implement the interface directly instead of adopting this package. With no provider configured, nothing about the board changes.

## Precondition: native metrics must be on

The recorder can only snapshot what BullMQ is already collecting, so your Workers need native metrics enabled with a window wide enough to survive any recorder downtime:

```ts
import { Worker, MetricsTime } from 'bullmq';

const worker = new Worker(name, processor, {
  connection,
  metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
});
```

If metrics aren't enabled on the workers, `queue.getMetrics()` returns nothing, and the recorder has nothing to snapshot. A week-long window gives the recorder plenty of slack to catch up after a deploy or an outage before any minute falls out of the ring buffer unrecorded.

## Install

```bash
yarn add @bull-board/metrics
```

`ioredis` is a peer dependency; you already have it if you're using BullMQ.

## Set up the recorder

In the process where your workers run:

```ts
import { MetricsRecorder } from '@bull-board/metrics';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

const recorder = new MetricsRecorder({
  queues: [new BullMQAdapter(myQueue)],
  connection: redisOptions, // same ioredis connection options your app uses
  retentionDays: 90, // optional, default 90
  snapshotIntervalMs: 60_000, // optional, default 60s
});
recorder.start();
```

Retention is enforced with Redis TTL, so old buckets expire on their own; there's nothing to prune by hand. Buckets are UTC-aligned, and every key the recorder writes is namespaced under `bull-board:metrics:`, so it can't collide with BullMQ's own keys.

On shutdown, call `recorder.stop()`. It clears the snapshot interval and, if the recorder created its own Redis connection internally, closes it too. If you passed in your own `Redis` instance, `stop()` leaves that connection alone, so it's a safe no-op to call either way.

## Register the provider

Where you build the board. The per-queue chart on each queue page needs `showMetrics: true` in `uiConfig` as well (see [UIConfig](/configuration/ui-config)); the dedicated "Metrics history" page below doesn't need it, but you'll usually want both:

```ts
import { createBullBoard } from '@bull-board/api';
import { RedisMetricsHistoryProvider } from '@bull-board/metrics';

createBullBoard({
  queues,
  serverAdapter,
  options: {
    uiConfig: { showMetrics: true },
    historyProvider: new RedisMetricsHistoryProvider({ connection: redisOptions }),
  },
});
```

Call `provider.disconnect()` alongside `recorder.stop()` on shutdown. Same rule applies: it only closes the Redis connection if the provider opened it itself.

## What changes in the UI

Once a `historyProvider` is configured, `hasHistoryProvider` flips on and things show up in two places, gated by two separate settings.

With `showMetrics: true`, each queue's metrics chart gains a range selector: 60m, 7d, 30d, 90d. 60m stays exactly what it was, the live native view straight off the ring buffer. The longer ranges switch to reading from the history provider instead. Without `showMetrics: true`, the per-queue chart doesn't render at all, range selector included, regardless of whether a `historyProvider` is set. The chart can also be collapsed with the chevron in its header; the collapsed state is remembered.

![Queue metrics chart with the 60m / 7d / 30d / 90d range selector](/screenshots/historical-metrics-range.png)

A "Metrics history" page also appears in the sidebar, independent of `showMetrics`. It's a cross-queue view, the closest thing bull-board has to a wallboard: total completed/failed throughput across every registered queue, over the same range selector, plus a per-queue breakdown table underneath (each queue's completed/failed totals with a proportional bar, sorted by throughput).

![The dedicated Metrics history page showing cross-queue throughput](/screenshots/historical-metrics-page.png)

Leave `historyProvider` unset and none of this appears; the board behaves exactly as it did before.

## Scope

This is BullMQ only. Bull v3 has no native metrics to snapshot. Only completed and failed throughput are tracked; there's no history for other job states or for job data itself.

The shipped UI reads daily rollups. The provider also supports hourly granularity through the `/api/metrics/history` endpoint (`granularity: 'hour'`) for custom consumers, though the built-in charts and the Metrics history page don't use it.
