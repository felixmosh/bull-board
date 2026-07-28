import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import type { Redis } from 'ioredis';
import { bucketIndex, emptyVector } from './histogram';
import { NAMESPACE } from './keys';
import type { LatencyMetric, LatencyStore } from './LatencyStore';

const MS_PER_HOUR = 3600000;
const SECONDS_PER_DAY = 86400;
const DEFAULT_MAX_SAMPLES = 5000;
/**
 * ZADD into the finished set and this scan are not atomic with respect to each other, so a
 * job finishing microseconds before the scan can be absent from it. Advancing the watermark
 * to the highest score seen would skip that job forever. Scanning only up to a slightly
 * stale bound, and advancing the watermark to that bound rather than to what was observed,
 * means anything finishing inside the margin is picked up by the next tick instead.
 * Costs a few seconds of freshness in data that is bucketed hourly.
 *
 * The score is `Date.now()` read in the worker process and passed into BullMQ's Lua, not a
 * Redis-side clock, so the margin only holds while the worker and this recorder agree on
 * the time: the effective margin is `margin - skew`. A worker running far enough ahead of
 * the recorder can still land jobs below an already-advanced watermark and lose them.
 */
const SAFETY_MARGIN_MS = 5000;

interface AdapterWithKeys extends BaseAdapter {
  getQueueKey(set: string): string;
}

export interface LatencySamplerOptions {
  redis: Redis;
  store: LatencyStore;
  /** Recorder tick, used to size the lease and to bound a cold start. */
  tickMs: number;
  /** Above this, the tick subsamples uniformly rather than fetching every job. */
  maxSamplesPerTick?: number;
  /**
   * How far back from now a scan stops. Defaults to SAFETY_MARGIN_MS. Injectable so tests
   * can set it to 0 and sample jobs that just finished, rather than sleeping past the
   * margin in every case.
   */
  safetyMarginMs?: number;
}

/**
 * Copies job durations out of BullMQ's finished sets on the recorder's tick.
 *
 * BullMQ's moveToFinished does `ZADD targetSet, timestamp, jobId` and writes the same value
 * to finishedOn, so the completed and failed sets are sorted sets scored by finish time.
 * Scanning past a stored watermark therefore returns exactly the jobs finished since the
 * last tick, with no gaps and no bias. The only loss is a queue whose removeOnComplete
 * trims faster than the tick runs.
 */
export class LatencySampler {
  private readonly redis: Redis;
  private readonly store: LatencyStore;
  private readonly tickMs: number;
  private readonly maxSamples: number;
  private readonly safetyMarginMs: number;
  private readonly id = `${process.pid}-${Math.random().toString(36).slice(2)}`;

  constructor(opts: LatencySamplerOptions) {
    this.redis = opts.redis;
    this.store = opts.store;
    this.tickMs = opts.tickMs;
    this.maxSamples = opts.maxSamplesPerTick ?? DEFAULT_MAX_SAMPLES;
    this.safetyMarginMs = opts.safetyMarginMs ?? SAFETY_MARGIN_MS;
  }

  static supports(adapter: BaseAdapter): boolean {
    return typeof (adapter as Partial<AdapterWithKeys>).getQueueKey === 'function';
  }

  /**
   * One queue, one tick. Swallows its own errors: the counter snapshot is the more
   * important metric and must not fail as collateral damage from a latency scan.
   */
  async sample(adapter: BaseAdapter): Promise<void> {
    if (!LatencySampler.supports(adapter)) {
      return;
    }
    const name = adapter.getName();
    try {
      if (!(await this.acquireLease(name))) {
        return;
      }
      try {
        await this.sampleDurations(adapter as AdapterWithKeys, name);
        await this.sampleQueueAge(adapter as AdapterWithKeys, name);
      } finally {
        await this.releaseLease(name);
      }
    } catch {
      // Intentionally swallowed, see the method comment.
    }
  }

  private leaseKey(name: string): string {
    return `${NAMESPACE}:${name}:latency:lease`;
  }

  /**
   * Increments are not idempotent the way the counter upsert is, so two recorders scanning
   * the same range would double every histogram. Only the lease holder scans.
   *
   * The TTL is a crash ceiling, not the normal lifetime: a process that dies mid-scan must
   * not lock the queue out forever. The normal path releases in a finally, because a lease
   * outliving its scan would make the next tick no-op and halve the sampling rate.
   */
  private async acquireLease(name: string): Promise<boolean> {
    const held = await this.redis.set(this.leaseKey(name), this.id, 'PX', this.tickMs * 2, 'NX');
    return held === 'OK';
  }

  /** Compare and delete, so a lease that already expired and was retaken is left alone. */
  private async releaseLease(name: string): Promise<void> {
    await this.redis.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
       return 0`,
      1,
      this.leaseKey(name),
      this.id
    );
  }

  private watermarkKey(name: string): string {
    return `${NAMESPACE}:${name}:latency:watermark`;
  }

  /**
   * Bounded rather than eternal: an unexpiring watermark would leave one key behind per
   * queue forever once that queue is purged or decommissioned, which is exactly the
   * unbounded-storage failure this package exists to avoid. The day retention is already the
   * horizon everything else here is bounded by. Losing the watermark just means the next
   * tick cold starts, which is already a supported path.
   */
  private watermarkTtlSeconds(): number {
    return Math.max(1, Math.floor(this.store.retention.days * SECONDS_PER_DAY));
  }

  private async sampleDurations(adapter: AdapterWithKeys, name: string): Promise<void> {
    const watermarkRaw = await this.redis.get(this.watermarkKey(name));
    // Cold start begins at the previous tick rather than backfilling, since a first run
    // against a large completed set would be a surprise fetch storm.
    const watermark = watermarkRaw ? Number(watermarkRaw) : Date.now() - this.tickMs;

    const upperBound = Date.now() - this.safetyMarginMs;
    if (upperBound <= watermark) {
      return; // ticks closer together than the margin; next tick covers this range
    }

    const ids: string[] = [];
    for (const set of ['completed', 'failed']) {
      const found = await this.redis.zrangebyscore(
        adapter.getQueueKey(set),
        `(${watermark}`,
        upperBound
      );
      ids.push(...found);
    }
    if (ids.length === 0) {
      await this.redis.set(
        this.watermarkKey(name),
        String(upperBound),
        'EX',
        this.watermarkTtlSeconds()
      );
      return;
    }

    // The id list is one cheap round trip; the HMGETs are the real cost. Above the cap take
    // a uniform subset rather than the first N, which would bias towards the tick's start.
    const selected = ids.length > this.maxSamples ? sampleUniformly(ids, this.maxSamples) : ids;
    // Counts are scaled back up by this ratio, so a subsampled hour reads as an estimate
    // with the same shape rather than a dip. The fact that it was subsampled is currently
    // invisible to clients: marking it would mean persisting a flag alongside the packed
    // vector, which is a storage-format change. Known follow-up.
    const ratio = ids.length / selected.length;

    const pipeline = this.redis.pipeline();
    for (const id of selected) {
      pipeline.hmget(
        adapter.getQueueKey(String(id)),
        'timestamp',
        'processedOn',
        'finishedOn',
        // BullMQ 5 counts attempts in `atm`; `attemptsMade` is the pre-v5 name and is read
        // as a fallback exactly the way Job.fromJSON does.
        'atm',
        'attemptsMade'
      );
    }
    const rows = await pipeline.exec();

    const runByHour = new Map<number, number[]>();
    const waitByHour = new Map<number, number[]>();

    for (const row of rows ?? []) {
      const values = row?.[1] as (string | null)[] | undefined;
      if (!values) {
        continue;
      }
      const [timestamp, processedOn, finishedOn, atm, attemptsMade] = values;
      if (!processedOn || !finishedOn) {
        continue;
      }
      const finished = Number(finishedOn);
      const processed = Number(processedOn);
      const hour = Math.floor(finished / MS_PER_HOUR);

      observe(runByHour, hour, finished - processed, ratio);

      // A retried job's timestamp is its creation, but processedOn is the latest attempt,
      // so wait would absorb every prior attempt and backoff. Run time is unaffected.
      const attempts = Number(atm ?? attemptsMade ?? 0);
      if (timestamp && attempts <= 1) {
        // Every one of these is a Date.now() taken in some client process, not a Redis-side
        // clock: timestamp in the producer, processedOn in the worker. Skew between the two
        // can make the difference negative, hence the clamp.
        observe(waitByHour, hour, Math.max(0, processed - Number(timestamp)), ratio);
      }
    }

    await this.flush(name, 'runtime', runByHour);
    await this.flush(name, 'waittime', waitByHour);
    // The bound, not the highest score observed. See SAFETY_MARGIN_MS.
    await this.redis.set(
      this.watermarkKey(name),
      String(upperBound),
      'EX',
      this.watermarkTtlSeconds()
    );
  }

  private async flush(
    name: string,
    metric: LatencyMetric,
    byHour: Map<number, number[]>
  ): Promise<void> {
    for (const [hour, vector] of byHour) {
      // Scaled counts are fractional. Left unrounded, join(',') would write seventeen
      // significant digits per bucket and blow up the packed value the storage design
      // depends on staying small.
      await this.store.addSamples(
        name,
        metric,
        hour,
        vector.map((v) => Math.round(v))
      );
    }
  }

  /**
   * The backlog is not all in one place. `wait` holds it while the queue is running, but
   * pausing RENAMEs that list to `paused` and routes new jobs there, and anything added with
   * a priority goes to the `prioritized` sorted set instead, which can leave `wait`
   * permanently empty. Reading only `wait` reports a healthy zero for a queue that is badly
   * backed up, which is the opposite of what this gauge is for, so all three are consulted
   * and the worst age wins.
   */
  private async sampleQueueAge(adapter: AdapterWithKeys, name: string): Promise<void> {
    const hour = Math.floor(Date.now() / MS_PER_HOUR);
    const candidates = await this.redis
      .pipeline()
      // BullMQ LPUSHes to the wait list and workers RPOPLPUSH from it, so the tail is oldest.
      .lrange(adapter.getQueueKey('wait'), -1, -1)
      .lrange(adapter.getQueueKey('paused'), -1, -1)
      // The prioritized set is scored by priority, not by time, so neither end is guaranteed
      // to hold the oldest job. Both ends are an approximation, and a cheap one: the true
      // oldest would mean fetching the whole set every tick.
      .zrange(adapter.getQueueKey('prioritized'), 0, 0)
      .zrange(adapter.getQueueKey('prioritized'), -1, -1)
      .exec();

    // A pipeline reports failures per command: a Redis error arrives in the entry's error
    // slot next to a null result, rather than as a throw. Reading only the result slot turns
    // a failed read into an empty backlog and records an age of 0, which is the most
    // reassuring number this gauge can produce, at the moment it is least entitled to. A gap
    // in the series reads as "not measured" and is recoverable; a zero is a wrong answer that
    // looks like a healthy one, so a tick that could not read cleanly records nothing.
    if (!candidates || candidates.some(([error]) => error)) {
      return;
    }

    const ids = new Set<string>();
    for (const entry of candidates) {
      for (const id of (entry[1] as string[] | null) ?? []) {
        ids.add(String(id));
      }
    }
    if (ids.size === 0) {
      await this.store.recordQueueAge(name, hour, 0);
      return;
    }

    const stamps = this.redis.pipeline();
    for (const id of ids) {
      stamps.hget(adapter.getQueueKey(id), 'timestamp');
    }
    const rows = await stamps.exec();
    // Same reasoning: a failed timestamp read does not zero the gauge, it understates it,
    // which is the same wrong-but-reassuring answer in a quieter form.
    if (!rows || rows.some(([error]) => error)) {
      return;
    }

    const now = Date.now();
    let oldest = 0;
    for (const row of rows) {
      const raw = row[1] as string | null | undefined;
      if (!raw) {
        continue;
      }
      const enqueuedAt = Number(raw);
      if (!Number.isFinite(enqueuedAt)) {
        continue;
      }
      oldest = Math.max(oldest, now - enqueuedAt);
    }
    await this.store.recordQueueAge(name, hour, Math.max(0, oldest));
  }
}

function observe(
  byHour: Map<number, number[]>,
  hour: number,
  durationMs: number,
  ratio: number
): void {
  let vector = byHour.get(hour);
  if (!vector) {
    vector = emptyVector();
    byHour.set(hour, vector);
  }
  vector[bucketIndex(durationMs)] += ratio;
}

/** Evenly spaced pick across the list, which preserves the distribution's shape. */
function sampleUniformly(ids: string[], target: number): string[] {
  const stride = ids.length / target;
  const out: string[] = [];
  for (let i = 0; i < target; i++) {
    out.push(ids[Math.floor(i * stride)]);
  }
  return out;
}
