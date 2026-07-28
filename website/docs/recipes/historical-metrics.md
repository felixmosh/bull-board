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

If metrics aren't enabled on the workers, `queue.getMetrics()` returns nothing, and the recorder has nothing to snapshot. Registering the `historyProvider` still turns the history UI on, but with no snapshots behind it the charts simply render empty, the same way the live metrics view does when metrics are off. A week-long window gives the recorder plenty of slack to catch up after a deploy or an outage before any minute falls out of the ring buffer unrecorded.

## Job latency

Alongside the completed/failed counters, the recorder also tracks two histograms per queue: wait time and run time. Wait time is `processedOn - timestamp`, how long a job sat before a worker picked it up, and it's the signal that says you need more workers. Run time is `finishedOn - processedOn`, how long the handler itself took, and it's the signal that says the handler regressed. They're kept as two separate numbers rather than one combined figure because they point at different fixes: a wait spike means scale out, a run spike means look at the handler.

Collecting them needed no changes to your workers. BullMQ's `moveToFinished` does `ZADD targetSet, timestamp, jobId` when a job completes or fails, so the completed and failed sets are sorted sets scored by finish time. On the same tick that snapshots the counter metrics, the recorder scans each finished set past a watermark it keeps per queue, and that scan returns exactly the jobs that finished since the last tick, no more and no less, so there are no gaps and nothing is double-counted. Because it reads job hashes and sorted sets BullMQ already writes, latency sampling doesn't depend on `queue.getMetrics()` or the `metrics` worker option at all; the precondition above is only for the counter metrics.

The most important thing to understand about the wait histogram is what it can't see. It's built entirely from jobs that finished, so when a queue is genuinely backed up and jobs stop finishing, the histogram goes quiet exactly when the number matters most: a stalled queue looks identical to an idle one. That's why the recorder also records a queue-age gauge, the age of the oldest job still waiting, and the UI overlays it on the same axis as the wait chart. It keeps reporting when the histogram can't, because it doesn't depend on anything finishing. It's the same reason Sidekiq's `Queue#latency` measures how long the oldest job has been waiting rather than the latency of jobs it has already run.

Retries are excluded from the wait histogram, but not the run histogram. A job's `timestamp` field is set once, at creation, but `processedOn` is overwritten on every attempt, so a retried job's naive wait time would absorb every prior attempt and all the backoff between them. Run time has no such problem: every attempt gets its own sample, retried or not.

Percentiles read off these histograms are estimates, not exact values, bounded by the width of the bucket a sample landed in. The bucket layout is fixed and not something you can configure per queue, because two ranges holding different bucket layouts can't be merged into one percentile: a multi-day query has to combine buckets from different days, and that only works if every day used the same layout.

If a queue is configured with `removeOnComplete: true`, jobs are deleted the instant they finish, so there is nothing left in the completed set for the next tick to scan, and no latency data will ever appear for it. There's no error and no warning, just an empty chart. If latency data isn't showing up for a queue, this is the first thing to check.

Both charts appear under the throughput chart on a queue's own page, sharing its range selector. The wait chart is the one with the queue-age overlay, drawn dashed on the same axis:

![Runtime and wait time percentiles on a queue page, with the oldest waiting job overlaid on the wait chart](/screenshots/job-latency-queue.png)

The axes are logarithmic, and labelled as such. Latency spans orders of magnitude, so on a linear axis a p99 measured in minutes flattens p50 and p95 into a single line along the bottom and the chart stops saying anything about the typical case.

Latency sampling is on by default whenever the recorder runs. Set `latency: false` to turn it off:

```ts
const recorder = new MetricsRecorder({
  queues: [new BullMQAdapter(myQueue)],
  connection: redisOptions,
  latency: false, // optional, default true
});
```

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

Retention is enforced by Redis itself, so old buckets expire on their own and there's nothing to prune by hand. Buckets are UTC-aligned, and every key the recorder writes is namespaced under `bull-board:metrics:`, so it can't collide with BullMQ's own keys.

On shutdown, call `recorder.stop()`. It clears the snapshot interval and, if the recorder created its own Redis connection internally, closes it too. If you passed in your own `Redis` instance, `stop()` leaves that connection alone, so it's a safe no-op to call either way.

## Storage footprint

Worth understanding before you turn this on, since it writes to the same Redis your queues run on.

### Three resolutions, three retentions

Every snapshot is written at three resolutions at once: per-minute buckets, an hourly rollup, and a daily total. They cost wildly different amounts, so each has its own retention:

| Tier | What it holds | Default retention | Size per busy day, per queue and metric |
| --- | --- | --- | --- |
| Minute | One entry per minute that had activity | 7 days | ~72 KB |
| Hour | 24 entries per day | 90 days | ~0.3 KB |
| Day | One entry per day, in a single hash per queue | 90 days | ~15 bytes |

Those figures are measured, not estimated: `packages/metrics/tests/footprint.spec.ts` writes real data through the real code path and asserts them. Absolute numbers shift a little with your Redis version and `hash-max-listpack-entries`, so the test pins the ratios rather than exact bytes and prints what it measured.

The minute tier is roughly 240 times more expensive than the hourly rollup covering the same day. That single ratio is what the whole design turns on.

### What that adds up to

At the defaults, tracking both completed and failed:

| Scenario | Per queue |
| --- | --- |
| Busy every minute, around the clock | ~1.1 MB |
| Bursty, active roughly a tenth of the time | ~120 KB |
| Idle | ~0 |

Plus the cross-queue rollup, which costs about as much as one queue running at the combined rate, once, no matter how many queues you register.

Idle time is free. A minute with a zero count is never written, so the footprint follows how busy a queue actually is, not how long it has been recording.

### Why the rollups exist

Keeping 90 days of minute-level detail costs about 15 MB per queue. Keeping 90 days of *hourly* detail costs about 55 KB, and the daily charts the UI actually draws don't read either one, they read the daily totals.

So rather than storing one expensive resolution and throwing detail away later, the recorder writes all three as it goes. Every tier is derived from the same delta in the same atomic script, so they can't drift apart, and there is no compaction job to schedule, resume, or make idempotent after a crash.

That's what lets the minute window default to 7 days instead of 90, which is where the ~93% saving comes from. Nothing you can see in the UI changes.

### Tuning it

```ts
const recorder = new MetricsRecorder({
  queues: [new BullMQAdapter(myQueue)],
  connection: redisOptions,
  retention: {
    minutes: 7, // days of minute-level detail
    hours: 90, // days of hourly rollup
    days: 90, // days of daily totals
  },
});
```

Every tier is optional and falls back to the default. Pass the same `retention` to `RedisMetricsHistoryProvider` so reads use the same window.

The minute window is the one to think about, for two reasons. It is where essentially all the storage goes, and it doubles as the recorder's catch-up window: after downtime, the recorder will not backfill minutes older than it. Set it to at least as long as you'd want to recover from an outage, and no longer than your workers' `maxDataPoints` buffer can supply anyway. The default of 7 days lines up with the recommended `MetricsTime.ONE_WEEK`.

Cutting `minutes` to 1 takes a busy queue from ~1.1 MB to ~200 KB, at the cost of only being able to catch up on a day of downtime. Hourly and daily history are unaffected either way.

`retentionDays: N` still works as a shorthand. It sets the hourly and daily windows to `N` and leaves the minute window at its default, so an existing config can't accidentally ask for a year of minute-level detail.

### Nothing grows without a ceiling

Day-scoped keys carry a TTL that is only refreshed while that day is being written, so each one dies its tier's retention after the day it covers. The daily totals hashes are written every day, so their TTL keeps rolling forward; they're trimmed instead, dropping entries that fall outside the window on the first write of each new day. Both paths are covered by tests.

Upgrading from an earlier version is safe: days recorded before the hourly tier existed are still served, by folding their minute buckets on read.

### What latency costs

The figures above are for the completed/failed counters. Latency histograms and the queue-age gauge use a different, packed storage format, so they're measured separately against a real Redis rather than derived from the same arithmetic: a queue where most jobs land in a couple of buckets each hour costs a lot less than one where all 18 buckets fill up every hour, and only a real measurement across both shapes tells you which end of that range to expect.

| Scenario | Measured |
| --- | --- |
| One queue, 90 day retention, both histograms plus the queue-age gauge, realistic concentrated distribution | 254.5 KB |
| Same, pathological: all 18 buckets populated heavily every hour | 574.6 KB |
| Shared `__global__` cross-queue rollup | ~224 KB once, for the whole board |
| `sample()` wall time at 1000 finished jobs in one tick | 9.11 ms |
| Redis round trips per queue per tick | ~12, flat in job count |
| Subsampling cap holds tick time bounded | 5000 jobs: 30.39 ms, 10000 jobs: 29.94 ms |

The line that decides whether this is affordable on a large board is the global rollup: it's a single shared cost for the whole board, not multiplied per queue, because there is exactly one `__global__` key no matter how many queues are registered. 200 queues at typical traffic is roughly 200 × 254.5 KB, about 50 MB, plus the one shared 224 KB rollup, not 200 copies of it.

The round-trip count staying flat, and tick time barely moving between 5000 and 10000 jobs, come from the same design decision: above `maxSamplesPerTick`, the sampler takes a uniform subset of the finished jobs and scales the counts back up, rather than fetching every job, so a tick against a queue processing thousands of jobs a minute costs about the same as one processing hundreds.

## Inspecting and clearing history from the board

When the configured provider supports it (the shipped `RedisMetricsHistoryProvider` does), a **Storage** entry appears in the actions menu on the Metrics history page, next to the range selector. It's tucked into the menu because it's an occasional maintenance task rather than something you'd read day to day. Usage is only fetched when you open it, since measuring real memory use means reading every history key.

![The actions menu on the Metrics history page, with the Storage entry](/screenshots/historical-metrics-menu.png)

It shows the total footprint broken down by tier, so an unexpectedly large minute tier is visible at a glance, along with a per-queue table and the range of days on record.

![The Storage modal showing the footprint split by tier and by queue](/screenshots/historical-metrics-storage.png)

Two actions sit underneath it:

- **Keep only the last 7d / 30d / 90d** deletes everything recorded before the range you're currently charting.
- **Clear all history** deletes everything, for every queue.

Both open a confirmation that spells out exactly what goes: the cutoff date or the total size, that it can't be undone, and that the deleted days will stop appearing in the charts. Recording carries on either way, so new data starts accumulating from the next snapshot.

![The confirmation shown before clearing recorded history](/screenshots/historical-metrics-storage-confirm.png)

The actions are hidden when every registered queue is in `readOnlyMode`, matching how the rest of the board treats destructive operations. If your provider implements `getUsage` but not `purge`, the modal renders read-only.

One caveat on per-queue purges: the cross-queue rollup is corrected by subtracting the queue's own recorded values, so it needs those keys to still exist. A queue whose keys were already removed out of band, or whose minute hashes have aged out, can leave a residue in the rollup that a per-queue purge can't reach. Clearing all history resets it.

## Inspecting and clearing history from code

`MetricsHistoryAdmin` is the same maintenance surface as a plain library object, for a debug endpoint, a one-off script, or a cleanup job.

```ts
import { MetricsHistoryAdmin } from '@bull-board/metrics';

const admin = new MetricsHistoryAdmin({ connection: redisOptions });

const stats = await admin.stats();
// {
//   keys: 182, bytes: 1543210, minutes: 12480,
//   oldestDay: '2026-04-23', newestDay: '2026-07-22',
//   tiers: { minute: { keys: 14, bytes: 1400000 }, hour: {...}, day: {...} },
//   queues: [{ queue: 'mailer', keys: 91, bytes: 900123, minutes: 7200, tiers: {...} }, ...]
// }
```

`stats()` reports the real Redis footprint (`MEMORY USAGE` per key), split by tier and by queue, largest first, with the cross-queue rollup listed as `__global__`. Measurements go out in pipelined batches, so a namespace of a few thousand keys costs a couple of dozen round trips rather than a few thousand. It still reads every history key though, so treat it as an ops call rather than something to poll.

`purge()` deletes stored history. It's scoped to the `bull-board:metrics:` namespace and driven by `SCAN`, so it never blocks Redis and never touches your queues' own keys:

```ts
await admin.purge();                                    // everything
await admin.purge({ queue: 'mailer' });                 // one queue
await admin.purge({ before: '2026-06-01' });            // anything older than a day
await admin.purge({ queue: 'mailer', before: new Date('2026-06-01') });
```

Purging a single queue also subtracts that queue's numbers from the cross-queue rollup, so the Metrics history page reflects the queues that are left instead of keeping a deleted queue's throughput folded into the total. Purging is idempotent and safe to repeat, and the recorder simply starts refilling from the next snapshot.

Call `admin.disconnect()` when you're done. Like the recorder and the provider, it only closes the Redis connection if it opened one itself.

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

A "Metrics history" page also appears in the sidebar, independent of `showMetrics`. It's a cross-queue view, the closest thing bull-board has to a wallboard: total completed/failed throughput across every registered queue, over the same range selector, plus a per-queue breakdown table underneath, sorted by total runs.

Each row in that table carries a bar scaled against the busiest queue and split into a completed and a failed segment. Bar length compares volume between queues, the split compares outcomes inside one queue, and hovering a bar gives the exact counts. A queue that only fails a fraction of a percent of its runs would otherwise draw a segment too thin to see, so a non-zero segment never shrinks below 1% of the track. The failure rate is spelled out next to the failed count.

![The dedicated Metrics history page showing cross-queue throughput](/screenshots/historical-metrics-page.png)

Leave `historyProvider` unset and none of this appears; the board behaves exactly as it did before.

## Scope

This is BullMQ only. Bull v3 has no native metrics to snapshot. Completed and failed throughput, wait time, run time, and queue age are tracked; there's no history for other job states or for job data itself.

The shipped UI reads daily rollups. The provider also supports hourly granularity through the `/api/metrics/history` endpoint (`granularity: 'hour'`) for custom consumers, though the built-in charts and the Metrics history page don't use it.
