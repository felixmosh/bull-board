# Design: Historical job metrics for bull-board

Date: 2026-07-06
Status: Proposal (pre-issue). Intended to be refined into a GitHub design issue for the maintainer before any implementation.

## Problem

BullMQ's native metrics are a per-minute ring buffer capped at `maxDataPoints`, opt-in per worker, and per-queue only. Consequences:

- Retention is bounded by the ring buffer window (a few thousand recent minutes), not a wall-clock horizon. There is no way to ask "how many jobs completed and failed per day over the last 90 days."
- There is no cross-queue aggregate. Global throughput must be summed by the consumer.
- bull-board's current metrics UI (`QueueMetrics`, added in PR #1208) is a stateless proxy over `getMetrics` and shows a 60-minute window only.

Users want Sidekiq-style long-retention history (for example 90 days) and a global view, reusing the existing charts.

## Constraints (from the maintainer, on record)

These shape the design more than any technical concern:

1. The core API is a stateless UI view-model. felixmosh, issue #759: "The API is meant to serve only the UI purposes (it structures data just for the UI)." bull-board holds no server-side state anywhere; even UI settings persist to localStorage.
2. Cross-queue global stats on a dedicated dashboard are welcomed in principle. felixmosh authored #258 ("global stats and per queue stats... a quick view of the entire queues, maybe suitable to show on monitors") and closed #395 specifically because such stats belong on a dashboard, not the per-queue management page.
3. He prefers a small first PR to iterate on, and a design issue before speculative code. recharts is the standard chart lib and he is chart-lib-agnostic otherwise.

Design consequence: all stateful behavior lives in a new opt-in companion package. Core gains exactly one small optional read-seam whose only job is to feed the existing UI charts, which is squarely "UI purposes."

## Goals

- Long-retention (default 90 days) history of completed and failed job counts, per queue and as a cross-queue global rollup.
- Reuse the existing `QueueMetrics` recharts component: the 60-minute view stays on native `getMetrics`; longer ranges read the historical store.
- Keep the core API stateless. No storage, no scheduler, no state in `packages/api`.
- Opt-in. Zero cost and zero behavior change for users who do not enable it.

## Non-goals (this iteration)

- Alerting or notifications. Out of scope per the maintainer (#574) and better served by userland BullMQ events or Prometheus/Grafana.
- Depth gauges over time (waiting/active/delayed backlog trends). Phase 2.
- Latency/runtime percentiles. Not provided by `getMetrics`; would need a different capture path.
- Bull (legacy) support. BullMQ only in the first cut.
- Prometheus/OpenTelemetry export. Different consumer; explicitly punted to `bullmq-proxy` by the maintainer (#759).

## Approach: snapshot native metrics into long retention

Chosen over the alternative (incrementing counters from `QueueEvents`) for two reasons: it matches the intent of "extend the native metrics we already use," and it avoids the multi-process double-count problem.

BullMQ workers configured with `metrics: { maxDataPoints }` already maintain a per-minute, exactly-aggregated (across all workers) count of completed and failed jobs, readable via `queue.getMetrics(type, start, end)`. A snapshotter periodically copies the new minutes out of that ring buffer into a long-retention store before they roll off.

Because the source data is keyed by minute timestamp, the store is written idempotently by timestamp (not blind increment). Re-running the snapshotter, or running it in several processes, converges to the same values instead of double-counting. This removes the need for a singleton recorder or leader election.

Precondition to document prominently: workers must enable native metrics, and `maxDataPoints` must cover a window larger than the snapshot interval plus any tolerated snapshotter downtime, so no minutes are lost if the snapshotter pauses.

## Architecture (three pieces)

### 1. `@bull-board/metrics` (new package), write side: the Recorder

Runs in the user's always-on process (worker or app), started explicitly:

```ts
import { MetricsRecorder } from '@bull-board/metrics';

const recorder = new MetricsRecorder({
  queues,               // the same BullMQ Queue instances
  connection,           // reuse the app's Redis connection
  retentionDays: 90,    // default
  snapshotIntervalMs: 60_000,
});
recorder.start();
```

Each tick: for each queue and metric (`completed`, `failed`), read `getMetrics` for the minutes since the last stored timestamp and write them into the historical store, idempotently by minute. Maintain daily rollups for the long tail and optionally finer (hourly) buckets for a short recent window. Apply TTL equal to the retention horizon.

Storage encoding (implementation detail, not fixed by this proposal): a per-day Redis hash of minute -> value gives idempotent writes and compact storage, with daily totals derived or maintained alongside. Keys namespaced under the package (for example `bull-board:metrics:...`) so they never collide with BullMQ's own `bull:<queue>:metrics` keys.

### 2. Core read-seam (`packages/api`), the only core change

`createBullBoard` accepts an optional `historyProvider` implementing a small interface:

```ts
interface MetricsHistoryProvider {
  getHistory(query: {
    queue?: string;              // omitted = global rollup
    metric: 'completed' | 'failed';
    from: number;
    to: number;
    granularity: 'hour' | 'day';
  }): Promise<{ ts: number; value: number }[]>;
}
```

Core adds one optional endpoint, `GET /api/metrics/history`, registered as a normal entry in `appRoutes.api` (propagates to all server adapters for free). The handler delegates to the provider when present and returns a disabled/404 response when not. Core stores nothing and knows nothing about Redis keys; it only calls the interface. This keeps the core a stateless view-model.

The concrete Redis-backed provider ships in `@bull-board/metrics`:

```ts
createBullBoard({
  queues, serverAdapter,
  options: { historyProvider: new RedisMetricsHistoryProvider({ connection }) },
});
```

### 3. UI (`packages/ui`)

- Extend the existing `QueueMetrics` recharts chart with a range selector. `60m` stays on native `getMetrics` (unchanged). `7d / 30d / 90d` fetch `/api/metrics/history` via a new `useMetricsHistory` hook and query key. When no history provider is configured, the longer ranges are hidden.
- Add a cross-queue global view on the overview/dashboard page (the "monitor wallboard" felixmosh described in #258), backed by the global rollup.

The read seam in piece 2 is the crux of the pitch. Without it the package would need its own separate server and UI and could not reuse the charts. With it, one optional interface unlocks chart reuse while core stays stateless.

## Key decisions

- Capture: snapshot native `getMetrics` into long-retention buckets (not `QueueEvents` increments). Idempotent by minute timestamp, no singleton required. Requires worker-side native metrics enabled.
- MVP data scope: completed and failed throughput, daily granularity for the long tail, per-queue plus global rollup, BullMQ only.
- Core footprint: core defines the `MetricsHistoryProvider` interface and the optional endpoint only; the package owns storage and the concrete provider.
- Retention: configurable, default 90 days, enforced by TTL.

## Open questions (to settle in the issue thread)

1. Storage encoding: per-day hash of minute -> value vs separate daily-total keys. Affects read cost for a 90-day chart and memory footprint. Recommend per-day hash plus a maintained daily total.
2. Finer recent granularity: ship hourly buckets for the last day or two in the first cut, or daily-only for MVP.
3. Snapshotter downtime tolerance: recommended default `maxDataPoints` guidance for users (for example ONE_WEEK) so gaps are recoverable.
4. Where the interface lives: a shared types package vs `packages/api` typings. Recommend `packages/api` typings for minimal churn.

## Phased plan

- Phase 0: open the design issue. Reference #258, #618, #619, #395, #759. Lead with the stateless-core framing and the snapshot mechanism. Get maintainer buy-in on the read-seam before code.
- Phase 1: `@bull-board/metrics` recorder + Redis provider; core `historyProvider` interface + `GET /api/metrics/history`; UI range selector on the existing chart. Daily completed/failed, per-queue plus global, 90-day default.
- Phase 2: hourly recent granularity, depth gauges, Bull (legacy) support, dedicated global dashboard widgets.

## Prior art

- Sidekiq: per-day Redis counters (`stat:processed:YYYY-MM-DD`) read back for the history graph.
- Laravel Horizon: a scheduled `horizon:snapshot` command writes periodic aggregate snapshots to Redis. Closest precedent for both snapshot-based stats and its one native threshold alert.
- Taskforce.sh (BullMQ authors' paid dashboard), QueueDash, bull-monitor: metrics over time exist, with alerting reserved for paid tiers or delegated to Prometheus/Grafana.
