import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import type { Redis } from 'ioredis';
import { bucketIndex, emptyVector } from './histogram';
import { NAMESPACE } from './keys';
import type { LatencyMetric, LatencyStore } from './LatencyStore';

const MS_PER_HOUR = 3600000;
const DEFAULT_MAX_SAMPLES = 5000;
/**
 * ZADD into the finished set and this scan are not atomic with respect to each other, so a
 * job finishing microseconds before the scan can be absent from it. Advancing the watermark
 * to the highest score seen would skip that job forever. Scanning only up to a slightly
 * stale bound, and advancing the watermark to that bound rather than to what was observed,
 * means anything finishing inside the margin is picked up by the next tick instead.
 * Costs a few seconds of freshness in data that is bucketed hourly.
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
      await this.redis.set(this.watermarkKey(name), String(upperBound));
      return;
    }

    // The id list is one cheap round trip; the HMGETs are the real cost. Above the cap take
    // a uniform subset rather than the first N, which would bias towards the tick's start.
    const selected = ids.length > this.maxSamples ? sampleUniformly(ids, this.maxSamples) : ids;
    const ratio = ids.length / selected.length;

    const pipeline = this.redis.pipeline();
    for (const id of selected) {
      pipeline.hmget(
        adapter.getQueueKey(String(id)),
        'timestamp',
        'processedOn',
        'finishedOn',
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
      const [timestamp, processedOn, finishedOn, attemptsMade] = values;
      if (!processedOn || !finishedOn) {
        continue;
      }
      const finished = Number(finishedOn);
      const processed = Number(processedOn);
      const hour = Math.floor(finished / MS_PER_HOUR);

      observe(runByHour, hour, finished - processed, ratio);

      // A retried job's timestamp is its creation, but processedOn is the latest attempt,
      // so wait would absorb every prior attempt and backoff. Run time is unaffected.
      if (timestamp && Number(attemptsMade ?? 0) <= 1) {
        // finishedOn and processedOn come from the Redis script, but timestamp is stamped
        // by the producing client, so skew can make this negative.
        observe(waitByHour, hour, Math.max(0, processed - Number(timestamp)), ratio);
      }
    }

    await this.flush(name, 'runtime', runByHour);
    await this.flush(name, 'waittime', waitByHour);
    // The bound, not the highest score observed. See SAFETY_MARGIN_MS.
    await this.redis.set(this.watermarkKey(name), String(upperBound));
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

  private async sampleQueueAge(adapter: AdapterWithKeys, name: string): Promise<void> {
    // BullMQ LPUSHes to the wait list and workers RPOPLPUSH from it, so the tail is oldest.
    const [oldestId] = await this.redis.lrange(adapter.getQueueKey('wait'), -1, -1);
    const hour = Math.floor(Date.now() / MS_PER_HOUR);
    if (!oldestId) {
      await this.store.recordQueueAge(name, hour, 0);
      return;
    }
    const enqueuedAt = await this.redis.hget(adapter.getQueueKey(String(oldestId)), 'timestamp');
    if (!enqueuedAt) {
      await this.store.recordQueueAge(name, hour, 0);
      return;
    }
    await this.store.recordQueueAge(name, hour, Math.max(0, Date.now() - Number(enqueuedAt)));
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
