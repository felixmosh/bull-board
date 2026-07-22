# Feature: long-retention historical job metrics (opt-in)

## Motivation

The metrics we ship today (#1208) are a stateless proxy over BullMQ's `getMetrics`, which is a per-minute ring buffer: opt-in per worker, per-queue, and bounded by `maxDataPoints`. There is no way to ask "how many jobs completed and failed per day over the last 90 days," and no cross-queue global view. This is the recurring ask in #258 and #618, and the Sidekiq/Horizon-style history a lot of people expect from a queue dashboard.

I would like to add long-retention history (default 90 days) of completed/failed counts, per queue and as a global rollup, reusing the existing `QueueMetrics` charts.

## Design goal: keep the core stateless

I know the core API is meant to serve only the UI, and that bull-board holds no server-side state (#759). This proposal is built around that boundary, not against it:

- All stateful behavior (recording, storage, retention) lives in a new opt-in package, `@bull-board/metrics`. `packages/api` gains no storage, no scheduler, no state.
- The core gets exactly one small, optional read-seam whose only purpose is to feed the existing UI charts.
- If a user does not opt in, nothing changes and there is zero cost.

## Approach: extend the metrics we already have

Rather than count events ourselves, snapshot the native metrics we already read. Workers with `metrics` enabled already keep an exactly-aggregated per-minute count in Redis. A small recorder in the user's own process periodically copies the new minutes out of that ring buffer into a long-retention store before they roll off.

Because the source is keyed by minute timestamp, the store is written idempotently by timestamp. Running the recorder in several processes converges to the same values instead of double-counting, so no singleton or leader election is needed. Precondition: workers must have native metrics enabled, since we are extending the retention of that same data.

## Pieces

Each piece below notes why it is shaped this way rather than the obvious alternative, since that is where I would most like your feedback.

### 1. `@bull-board/metrics` (new package), write side

Runs in the user's app/worker process:
```ts
new MetricsRecorder({ queues, connection, retentionDays: 90 }).start();
```
It snapshots `getMetrics('completed'|'failed')` into namespaced, TTL'd Redis keys (daily rollups, per queue plus a global rollup).

- Why a separate package, not core: recording is inherently stateful (it owns Redis keys, a timer, and a retention policy). Putting it in `packages/api` would break the "core serves only the UI, holds no state" boundary. A separate opt-in package keeps that boundary intact and costs nothing for users who do not enable it.
- Why in the user's process, not inside the dashboard: history must be recorded continuously, and the dashboard is not guaranteed to be always-on. This is why Sidekiq records in the worker and Horizon records via a scheduled command, not in their web UI.
- Why snapshot `getMetrics`, not count `QueueEvents` ourselves: `QueueEvents` delivers every event to every listener, so a recorder running in N processes would count each job N times and would need a singleton or leader election. Snapshotting reads BullMQ's already-aggregated per-minute counts and writes them idempotently by minute timestamp, so multiple processes converge instead of double-counting. It also literally extends the retention of the same data the UI already shows.

### 2. Core read-seam (`packages/api`), the only core change

`createBullBoard` takes an optional `historyProvider`:
```ts
interface MetricsHistoryProvider {
  getHistory(q: { queue?: string; metric: 'completed' | 'failed'; from: number; to: number; granularity: 'hour' | 'day' }): Promise<{ ts: number; value: number }[]>;
}
```
One optional endpoint `GET /api/metrics/history` delegates to the provider when present and 404s when not. Core stores nothing and knows nothing about the Redis schema. The concrete Redis-backed provider ships in `@bull-board/metrics`.

- Why an interface, not core reading Redis directly: this keeps core a view-model that is ignorant of storage. The backing store stays swappable (Redis today, but someone could back it with Postgres or an existing TSDB) without any core change, and core never becomes storage-aware or stateful.
- Why put one endpoint in core rather than a fully separate server in the package: the goal is to reuse the existing charts, which are served by core's route table and propagated to every server adapter automatically. A standalone server would force a standalone UI and lose that reuse. Adding a single entry to `appRoutes.api` reaches all adapters for free.
- Why a typed option on `createBullBoard`, not a plugin/registration system: bull-board has no plugin system and I do not think it needs a general one for this. A single optional option is the minimal surface and matches the existing `options`/`uiConfig` pattern.

### 3. UI (`packages/ui`)

Add a range selector to the existing `QueueMetrics` chart: `60m` stays on native `getMetrics`; `7d/30d/90d` read `/api/metrics/history` (the longer ranges are hidden when no provider is configured). Plus a cross-queue global view on the overview page, the "quick view suitable for monitors" from #258.

- Why extend `QueueMetrics` rather than build a new metrics UI: reuse keeps the change small and stays on recharts. The range selector is additive, and non-users see no difference.
- Why the global view lives on the overview page, not the per-queue page: aggregate stats on the per-queue management view add clutter to a page meant for managing one queue. This matches the reason #395 was closed and the split you described in #258 (global stats and per-queue stats, kept separate).

## Non-goals

- Alerting/notifications (out of scope per #574; userland events or Prometheus fit better).
- Depth/backlog gauges over time, latency percentiles, Bull (legacy), Prometheus export. Possible later, not in the first cut.

## Open questions

- Storage encoding for idempotent-yet-compact daily data (leaning per-day hash of minute -> value plus a maintained daily total).
- Whether to include hourly granularity for the last day or two in the first cut, or ship daily-only.
- Recommended `maxDataPoints` guidance so a paused recorder does not lose data.

@felixmosh happy to start with a small PR for the core seam plus a minimal `@bull-board/metrics` and iterate from there, if the overall shape looks right to you. The two decisions I would most like your call on: does the opt-in-package plus stateless-read-seam split work for you, and is `historyProvider` on `createBullBoard` the interface you would want (vs some other extension point)?

Refs: #258, #618, #619, #395, #759, #1208
