// oxlint-disable no-console
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import {
  BUCKET_COUNT,
  LatencyStore,
  MetricsRecorder,
  RedisMetricsHistoryProvider,
} from '@bull-board/metrics';
import * as Bull from 'bull';
import Queue3 from 'bull';
import { FlowProducer, JobsOptions, MetricsTime, Queue as QueueMQ, Worker } from 'bullmq';
import express from 'express';
import { Redis } from 'ioredis';

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
};

const sleep = (t: number) => new Promise((resolve) => setTimeout(resolve, t * 1000));
const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

const createQueue3 = (name: string) =>
  new Queue3(name, { redis: redisOptions, metrics: { maxDataPoints: MetricsTime.ONE_WEEK } });
const createQueueMQ = (name: string, defaultJobOptions?: JobsOptions) =>
  new QueueMQ(name, { connection: redisOptions, defaultJobOptions });

function setupBullProcessor(bullQueue: Bull.Queue) {
  bullQueue.process(async (job) => {
    for (let i = 0; i <= 100; i++) {
      await sleep(Math.random());
      const message = `Processing job at interval ${i}`;
      await job.progress({ progress: i, message });
      await job.log(message);
      if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`);
    }

    return { jobId: `This is the return value of job (${job.id})` };
  });
}

function setupBullMQProcessor(queueName: string) {
  new Worker(
    queueName,
    async (job) => {
      for (let i = 0; i <= 100; i++) {
        await sleep(Math.random());
        const message = `Processing job at interval ${i}`;
        await job.updateProgress({ progress: i, message });
        await job.log(message);

        if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`);
      }

      return { jobId: `This is the return value of job (${job.id})` };
    },
    {
      connection: redisOptions,
      metrics: {
        maxDataPoints: MetricsTime.ONE_WEEK,
      },
    }
  );
}

function setupSimWorker(queueName: string) {
  return new Worker(
    queueName,
    async (job) => {
      await sleep(0.4 + Math.random() * 1.6);
      await job.updateProgress(randomInt(0, 100));
      if (job.name === 'unreliable-chunk') throw new Error('Simulated downstream error');
      if (Math.random() < 0.18) throw new Error('Simulated downstream error');
      return { ok: true };
    },
    {
      connection: redisOptions,
      concurrency: 2,
      metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
    }
  );
}

async function seedQueue(queue: QueueMQ) {
  const backlog = randomInt(30, 110);
  const delayed = randomInt(4, 14);
  const prioritized = randomInt(6, 18);
  await queue.addBulk(
    Array.from({ length: backlog }, (_, i) => ({ name: 'process', data: { seq: i } }))
  );
  await queue.addBulk(
    Array.from({ length: delayed }, (_, i) => ({
      name: 'scheduled',
      data: { seq: i },
      opts: { delay: 60 * 60 * 1000 },
    }))
  );
  await queue.addBulk(
    Array.from({ length: prioritized }, (_, i) => ({
      name: 'urgent',
      data: { seq: i },
      opts: { priority: randomInt(1, 5) },
    }))
  );
}

/**
 * Without a trickle of new work every queue drains to all-completed within a minute,
 * so the board never shows active, waiting or prioritized jobs. This keeps it looking
 * like a system that is actually running.
 */
function startTraffic(queues: QueueMQ[]) {
  setInterval(() => {
    const queue = queues[randomInt(0, queues.length - 1)];
    const batch = randomInt(4, 12);
    void queue.addBulk(
      Array.from({ length: batch }, (_, i) => ({
        name: Math.random() < 0.25 ? 'urgent' : 'process',
        data: { seq: i, at: Date.now() },
        ...(Math.random() < 0.25 ? { opts: { priority: randomInt(1, 5) } } : {}),
      }))
    );
  }, 2000);
}

/** Parents sit in waiting-children until their children finish, which is the only way
 *  that status ever appears on the board. */
async function seedFlows(flow: FlowProducer, queueName: string) {
  for (let i = 0; i < 6; i++) {
    await flow.add({
      name: 'batch-report',
      queueName,
      data: { batch: i },
      children: Array.from({ length: randomInt(2, 4) }, (_, child) => ({
        name: 'batch-chunk',
        queueName,
        data: { batch: i, chunk: child },
      })),
    });
  }

  for (let i = 0; i < 3; i++) {
    await flow.add({
      name: 'batch-report-partial',
      queueName,
      data: { batch: `partial-${i}` },
      children: [
        { name: 'batch-chunk', queueName, data: { chunk: 'ok' } },
        {
          name: 'unreliable-chunk',
          queueName,
          data: { chunk: 'ignored' },
          opts: { ignoreDependencyOnFailure: true, attempts: 1 },
        },
      ],
    });
  }
}

/** The Schedulers view only appears once some queue carries a job scheduler, so seed a
 *  spread of them: both repeat forms, a timezone, a run limit and a job template. */
const schedulerDefs: Array<{
  queueName: string;
  id: string;
  repeat: Parameters<QueueMQ['upsertJobScheduler']>[1];
  template: Parameters<QueueMQ['upsertJobScheduler']>[2];
}> = [
  {
    queueName: 'Emails.Marketing.Digest',
    id: 'daily-digest',
    repeat: { pattern: '0 9 * * *', tz: 'Europe/Warsaw' },
    template: { name: 'digest', data: { segment: 'weekly-active' } },
  },
  {
    queueName: 'Search.IndexUpdate',
    id: 'index-refresh',
    repeat: { every: 15 * 60 * 1000 },
    template: { name: 'reindex', data: { scope: 'incremental' } },
  },
  {
    queueName: 'Payments.Invoice',
    id: 'monthly-invoices',
    repeat: { pattern: '0 3 1 * *', tz: 'UTC' },
    template: { name: 'invoice-run', data: { period: 'previous-month' }, opts: { priority: 2 } },
  },
  {
    queueName: 'Media.Image.Optimize',
    id: 'thumbnail-sweep',
    repeat: { every: 5 * 60 * 1000, limit: 12 },
    template: { name: 'sweep', data: { olderThanDays: 30 } },
  },
];

async function seedSchedulers(queues: QueueMQ[]) {
  const byName = new Map(queues.map((queue) => [queue.name, queue]));

  for (const { queueName, id, repeat, template } of schedulerDefs) {
    await byName.get(queueName)?.upsertJobScheduler(id, repeat, template);
  }
}

const retrying = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 500,
  removeOnFail: 1000,
};
const fireAndForget = { attempts: 1, removeOnComplete: 200, removeOnFail: 200 };

const groupedQueueDefs: Array<[string, JobsOptions?]> = [
  ['Emails.Transactional.Welcome', retrying],
  ['Emails.Transactional.PasswordReset', retrying],
  ['Emails.Transactional.Receipt', retrying],
  ['Emails.Marketing.Digest', fireAndForget],
  ['Emails.Marketing.Promotions', fireAndForget],
  ['Media.Image.Resize', { attempts: 5, removeOnComplete: 500 }],
  ['Media.Image.Optimize', { attempts: 5, removeOnComplete: 500 }],
  [
    'Media.Video.Transcode',
    { attempts: 2, backoff: { type: 'fixed', delay: 5000 }, removeOnComplete: 200 },
  ],
  ['Media.Video.Thumbnail', { attempts: 3, removeOnComplete: 200 }],
  ['Payments.Charge', retrying],
  ['Payments.Refund', retrying],
  [
    'Payments.Payout',
    {
      attempts: 10,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  ],
  ['Payments.Invoice', { attempts: 3, removeOnComplete: 500 }],
  ['Notifications.Push', fireAndForget],
  ['Notifications.Sms', { attempts: 2, removeOnComplete: 200 }],
  ['Webhooks.Outbound', { attempts: 8, removeOnComplete: 1000 }],
  ['Webhooks.DeadLetter', { attempts: 1, removeOnComplete: 500 }],
  ['Search.Reindex', { removeOnComplete: 200 }],
  ['Search.IndexUpdate', { attempts: 2, removeOnComplete: 200 }],
];

// ---------------------------------------------------------------------------------------
// Demo-only metrics history backfill. NOT something a real deployment would ever do.
//
// MetricsRecorder only ever writes what it observes going forward, so a fresh Redis shows
// completely empty Metrics history and latency charts until the recorder has genuinely been
// running for weeks. That's fine for a real deployment, but useless for anyone evaluating
// bull-board or reviewing the latency-histogram feature: they see nothing. This backfill
// fabricates 30 days of plausible-looking history directly in Redis on startup so the charts
// have something to show immediately.
//
// It writes straight into the storage @bull-board/metrics defines, using its public
// `LatencyStore` export for latency histograms and the queue-age gauge. There is no public
// writer for arbitrary backdated counter (completed/failed) totals -- `HistoryStore`, which
// owns that, is intentionally not exported (see packages/metrics/src/index.ts), and the only
// public path to counter history (`MetricsRecorder`) always derives it live from BullMQ's own
// per-minute buffer, which can't be backdated 30 days. So the counter totals hash below is
// written with its documented key shape instead (see the `<ns>:<queue>:<metric>:totals`
// comment on `parseHistoryKey` in packages/metrics/src/HistoryAdmin.ts) rather than via a
// nonexistent public writer.
// ---------------------------------------------------------------------------------------

const DEMO_METRICS_NAMESPACE = 'bull-board:metrics'; // mirrors NAMESPACE in packages/metrics/src/keys.ts (not exported)
const DEMO_GLOBAL_QUEUE = '__global__'; // mirrors GLOBAL_QUEUE in packages/metrics/src/keys.ts (not exported)
const DEMO_BACKFILL_MARKER_KEY = 'bull-board:demo:backfill:v1';
const DEMO_BACKFILL_DAYS = 30;
// Mirrors MetricsRecorder's DEFAULT_RETENTION (packages/metrics/src/MetricsRecorder.ts),
// which is not exported. Used so the seeded latency/queue-age keys expire the same way real
// recorder-written ones would.
const DEMO_RETENTION = { minutes: 7, hours: 90, days: 90 };

const DAY_MS = 86400000;
const MS_PER_HOUR = 3600000;
const SECONDS_PER_DAY = 86400;

interface DemoQueueProfile {
  name: string;
  /** Jobs/day once ramped up, before the weekly wobble and spike are applied. */
  baseVolume: number;
  failRate: number;
  /** Bucket index (into BUCKET_BOUNDS) the runtime/waittime histograms peak around. */
  runtimePeakBucket: number;
  waitPeakBucket: number;
  queueAgeBaselineMs: number;
  /** Only set on the one queue that tells the "getting worse" story over the last few days. */
  regression?: {
    runtimePeakBucketEnd: number;
    waitPeakBucketEnd: number;
    queueAgeEndMs: number;
    failRateEnd: number;
  };
}

// Bucket index -> upper bound, for reference (BUCKET_BOUNDS in packages/metrics/src/histogram.ts):
// 0:10ms 1:25ms 2:50ms 3:100ms 4:250ms 5:500ms 6:1s 7:2.5s 8:5s 9:10s 10:30s 11:60s
// 12:5m 13:10m 14:30m 15:1h 16:6h 17:overflow
const DEMO_QUEUE_PROFILES: DemoQueueProfile[] = [
  {
    // Steady, near-perfect and fast: an append-only log behaves nothing like the queues that
    // retry, so the history charts have one flat line to compare the spiky ones against.
    name: 'Compliance.AuditLog',
    baseVolume: 5200,
    failRate: 0.001,
    runtimePeakBucket: 2,
    waitPeakBucket: 1,
    queueAgeBaselineMs: 800,
  },
  {
    name: 'Orders.Fulfillment',
    baseVolume: 1800,
    failRate: 0.04,
    runtimePeakBucket: 6,
    waitPeakBucket: 4,
    queueAgeBaselineMs: 15_000,
  },
  {
    name: 'Emails.Transactional.Welcome',
    baseVolume: 2200,
    failRate: 0.02,
    runtimePeakBucket: 3,
    waitPeakBucket: 2,
    queueAgeBaselineMs: 3_000,
  },
  {
    name: 'Emails.Transactional.PasswordReset',
    baseVolume: 900,
    failRate: 0.01,
    runtimePeakBucket: 3,
    waitPeakBucket: 1,
    queueAgeBaselineMs: 2_000,
  },
  {
    name: 'Emails.Transactional.Receipt',
    baseVolume: 1500,
    failRate: 0.015,
    runtimePeakBucket: 3,
    waitPeakBucket: 2,
    queueAgeBaselineMs: 2_500,
  },
  {
    name: 'Emails.Marketing.Digest',
    baseVolume: 600,
    failRate: 0,
    runtimePeakBucket: 4,
    waitPeakBucket: 3,
    queueAgeBaselineMs: 4_000,
  },
  {
    name: 'Emails.Marketing.Promotions',
    baseVolume: 3000,
    failRate: 0.03,
    runtimePeakBucket: 4,
    waitPeakBucket: 5,
    queueAgeBaselineMs: 8_000,
  },
  {
    name: 'Media.Image.Resize',
    baseVolume: 4000,
    failRate: 0.02,
    runtimePeakBucket: 5,
    waitPeakBucket: 3,
    queueAgeBaselineMs: 6_000,
  },
  {
    name: 'Media.Image.Optimize',
    baseVolume: 3500,
    failRate: 0.025,
    runtimePeakBucket: 6,
    waitPeakBucket: 4,
    queueAgeBaselineMs: 7_000,
  },
  {
    name: 'Media.Video.Transcode',
    baseVolume: 350,
    failRate: 0.05,
    runtimePeakBucket: 9, // tens of seconds baseline
    waitPeakBucket: 7,
    queueAgeBaselineMs: 20_000,
    // The regression story: a transcoding queue that has been quietly getting worse over the
    // last 5 days -- runtime and wait shift two buckets slower, failures creep up, and the
    // backlog age climbs from 20s to 10 minutes. This is the one chart worth screenshotting.
    regression: {
      runtimePeakBucketEnd: 11,
      waitPeakBucketEnd: 9,
      queueAgeEndMs: 600_000,
      failRateEnd: 0.12,
    },
  },
  {
    name: 'Media.Video.Thumbnail',
    baseVolume: 2800,
    failRate: 0.02,
    runtimePeakBucket: 5,
    waitPeakBucket: 3,
    queueAgeBaselineMs: 5_000,
  },
  {
    name: 'Payments.Charge',
    baseVolume: 2500,
    failRate: 0.03,
    runtimePeakBucket: 6,
    waitPeakBucket: 4,
    queueAgeBaselineMs: 6_000,
  },
  {
    name: 'Payments.Refund',
    baseVolume: 700,
    failRate: 0.02,
    runtimePeakBucket: 6,
    waitPeakBucket: 3,
    queueAgeBaselineMs: 5_000,
  },
  {
    name: 'Payments.Payout',
    baseVolume: 400,
    failRate: 0.06,
    runtimePeakBucket: 7,
    waitPeakBucket: 5,
    queueAgeBaselineMs: 10_000,
  },
  {
    name: 'Payments.Invoice',
    baseVolume: 1200,
    failRate: 0.015,
    runtimePeakBucket: 5,
    waitPeakBucket: 3,
    queueAgeBaselineMs: 4_000,
  },
  {
    name: 'Notifications.Push',
    baseVolume: 6000,
    failRate: 0,
    runtimePeakBucket: 1,
    waitPeakBucket: 1,
    queueAgeBaselineMs: 1_000,
  }, // fast queue, tens of ms
  {
    name: 'Notifications.Sms',
    baseVolume: 3200,
    failRate: 0.02,
    runtimePeakBucket: 2,
    waitPeakBucket: 1,
    queueAgeBaselineMs: 1_500,
  },
  {
    name: 'Webhooks.Outbound',
    baseVolume: 2600,
    failRate: 0.22,
    runtimePeakBucket: 4,
    waitPeakBucket: 3,
    queueAgeBaselineMs: 8_000,
  }, // high failure rate: flaky third-party endpoints
  {
    name: 'Webhooks.DeadLetter',
    baseVolume: 150,
    failRate: 0.08,
    runtimePeakBucket: 3,
    waitPeakBucket: 9,
    queueAgeBaselineMs: 400_000,
  }, // paused, backlog sits for minutes
  {
    name: 'Search.Reindex',
    baseVolume: 500,
    failRate: 0.03,
    runtimePeakBucket: 8,
    waitPeakBucket: 10,
    queueAgeBaselineMs: 900_000,
  }, // paused, backlog sits for ~15m
  {
    name: 'Search.IndexUpdate',
    baseVolume: 1800,
    failRate: 0.02,
    runtimePeakBucket: 4,
    waitPeakBucket: 3,
    queueAgeBaselineMs: 3_500,
  },
  {
    name: 'Notifications.User.NewRegistration',
    baseVolume: 1400,
    failRate: 0.01,
    runtimePeakBucket: 3,
    waitPeakBucket: 2,
    queueAgeBaselineMs: 2_000,
  },
  {
    name: 'Notifications;User;ResetPassword',
    baseVolume: 1100,
    failRate: 0.01,
    runtimePeakBucket: 3,
    waitPeakBucket: 2,
    queueAgeBaselineMs: 2_000,
  },
];

function demoIsoDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Distributes `totalSamples` across a handful of adjacent buckets around `peakBucket`, plus a
 * genuine long right tail further out -- what a real latency histogram looks like, as opposed
 * to an even spread across all 18 buckets.
 *
 * The body (peakBucket +/- 1) carries the bulk of samples, same as any real distribution
 * clustering around a typical value. What it deliberately does NOT do is stop there: two more
 * groups sit several buckets above the body specifically so p95 and p99 land in buckets the
 * body never reaches. Without them, p50/p95/p99 all fall inside or next to the body and read
 * as one indistinguishable cluster once plotted -- see the near-body-only weights this
 * replaced, where every percentile crowded into the last one or two buckets.
 */
function buildDemoLatencyVector(totalSamples: number, peakBucket: number): number[] {
  const vector = new Array(BUCKET_COUNT).fill(0);
  const clampIdx = (i: number) => Math.min(BUCKET_COUNT - 1, Math.max(0, i));
  const weighted: Array<[number, number]> = [
    [clampIdx(peakBucket - 1), 0.15],
    [clampIdx(peakBucket), 0.5],
    [clampIdx(peakBucket + 1), 0.2],
    // p95 lands here: far enough past the body that it reads as a distinct point on a log axis.
    [clampIdx(peakBucket + 2), 0.12],
    // The long tail: 3% of samples several buckets further out still, so p99 lands clearly
    // above p95 instead of sharing its bucket.
    [clampIdx(peakBucket + 5), 0.03],
  ];
  const merged = new Map<number, number>();
  for (const [idx, weight] of weighted) {
    merged.set(idx, (merged.get(idx) ?? 0) + weight);
  }
  const entries = [...merged.entries()];
  let assigned = 0;
  entries.forEach(([idx, weight], i) => {
    const count =
      i === entries.length - 1
        ? Math.max(0, totalSamples - assigned)
        : Math.round(totalSamples * weight);
    vector[idx] += count;
    assigned += count;
  });
  return vector;
}

/** A day about 11 days ago gets a 2-3x traffic burst, tapering on the days either side. */
function demoSpikeMultiplier(dayIndex: number): number {
  if (dayIndex === 19) return 2.6;
  if (dayIndex === 18 || dayIndex === 20) return 1.5;
  return 1;
}

/** 0 for the oldest seeded day up to 1.0 by day 5, so the throughput chart shows a ramp-up. */
function demoRampMultiplier(dayIndex: number): number {
  return 0.4 + 0.6 * Math.min(1, dayIndex / 8);
}

/** How far into the last-5-days regression window this day is: 0 outside it, up to 1.0 on the last seeded day. */
function demoRegressionProgress(dayIndex: number): number {
  const daysAgo = DEMO_BACKFILL_DAYS - dayIndex;
  if (daysAgo > 5) return 0;
  return (6 - daysAgo) / 5;
}

/**
 * Seeds 30 days of demo-only history (completed/failed counters, runtime/waittime latency
 * histograms, and the queue-age gauge) so the Metrics history and latency charts aren't
 * empty on a fresh Redis. Idempotent by checking real data first: if any day in the target
 * window already has a recorded value (from the real recorder or an earlier backfill), it
 * skips the whole thing rather than overwrite anything. Set `DEMO_BACKFILL=0` to disable it
 * outright. It never touches today, which is left for the real recorder to write.
 */
async function backfillDemoHistory(queueNames: string[]): Promise<void> {
  if (process.env.DEMO_BACKFILL === '0' || process.env.DEMO_BACKFILL === 'false') {
    console.log('[demo] DEMO_BACKFILL disabled, skipping metrics history backfill');
    return;
  }

  const knownNames = new Set(DEMO_QUEUE_PROFILES.map((p) => p.name));
  for (const name of queueNames) {
    if (!knownNames.has(name)) {
      console.warn(`[demo] No demo backfill profile for queue "${name}", it will show no history`);
    }
  }
  const profiles = DEMO_QUEUE_PROFILES.filter((p) => queueNames.includes(p.name));

  const redis = new Redis(redisOptions);
  try {
    const todayStartMs = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate()
    );
    const targetDays = Array.from({ length: DEMO_BACKFILL_DAYS }, (_, dayIndex) =>
      demoIsoDay(todayStartMs - (DEMO_BACKFILL_DAYS - dayIndex) * DAY_MS)
    );

    // Real safety net: if the recorder (or an earlier backfill) already wrote data for any
    // day in this window, this Redis is not a "fresh" one -- leave it alone entirely rather
    // than overwrite real history. The marker key below is just a fast path for the common
    // case; this check is what actually protects real data.
    const existingGlobalCompleted = await redis.hmget(
      `${DEMO_METRICS_NAMESPACE}:${DEMO_GLOBAL_QUEUE}:completed:totals`,
      ...targetDays
    );
    if (existingGlobalCompleted.some((value) => value !== null)) {
      console.log(
        '[demo] Metrics history already present for the backfill window, skipping (found existing recorded data)'
      );
      return;
    }

    const latencyStore = new LatencyStore({ redis, retention: DEMO_RETENTION });

    const completedByQueue = new Map<string, Record<string, string>>();
    const failedByQueue = new Map<string, Record<string, string>>();
    const completedGlobal: Record<string, number> = {};
    const failedGlobal: Record<string, number> = {};
    for (const profile of profiles) {
      completedByQueue.set(profile.name, {});
      failedByQueue.set(profile.name, {});
    }

    for (let dayIndex = 0; dayIndex < DEMO_BACKFILL_DAYS; dayIndex++) {
      const daysAgo = DEMO_BACKFILL_DAYS - dayIndex;
      const dayStartMs = todayStartMs - daysAgo * DAY_MS;
      const day = demoIsoDay(dayStartMs);
      const hour = Math.floor(dayStartMs / MS_PER_HOUR) + 12; // a representative "noon" hour for that day
      const dow = new Date(dayStartMs).getUTCDay();
      const weekdayMult = dow === 0 ? 0.5 : dow === 6 ? 0.6 : 1;
      const rampMult = demoRampMultiplier(dayIndex);
      const spikeMult = demoSpikeMultiplier(dayIndex);
      const t = demoRegressionProgress(dayIndex);

      const writes: Promise<void>[] = [];
      for (const profile of profiles) {
        const jitter = 0.9 + Math.random() * 0.2;
        const totalJobs = Math.max(
          1,
          Math.round(profile.baseVolume * rampMult * weekdayMult * spikeMult * jitter)
        );
        const failRate = profile.regression
          ? profile.failRate + t * (profile.regression.failRateEnd - profile.failRate)
          : profile.failRate;
        const failed = Math.round(totalJobs * failRate);
        const completed = totalJobs - failed;

        completedByQueue.get(profile.name)![day] = String(completed);
        failedByQueue.get(profile.name)![day] = String(failed);
        completedGlobal[day] = (completedGlobal[day] ?? 0) + completed;
        failedGlobal[day] = (failedGlobal[day] ?? 0) + failed;

        const runtimePeak = profile.regression
          ? Math.round(
              profile.runtimePeakBucket +
                t * (profile.regression.runtimePeakBucketEnd - profile.runtimePeakBucket)
            )
          : profile.runtimePeakBucket;
        const waitPeak = profile.regression
          ? Math.round(
              profile.waitPeakBucket +
                t * (profile.regression.waitPeakBucketEnd - profile.waitPeakBucket)
            )
          : profile.waitPeakBucket;
        const queueAgeMs = profile.regression
          ? Math.round(
              profile.queueAgeBaselineMs +
                t * (profile.regression.queueAgeEndMs - profile.queueAgeBaselineMs)
            )
          : profile.queueAgeBaselineMs;

        const runtimeVector = buildDemoLatencyVector(Math.max(completed, 1), runtimePeak);
        const waitVector = buildDemoLatencyVector(Math.max(totalJobs, 1), waitPeak);

        writes.push(latencyStore.addSamples(profile.name, 'runtime', hour, runtimeVector));
        writes.push(latencyStore.addSamples(profile.name, 'waittime', hour, waitVector));
        writes.push(
          latencyStore.recordQueueAge(profile.name, hour, queueAgeMs * (0.85 + Math.random() * 0.3))
        );
      }
      await Promise.all(writes);
    }

    const totalsTtlSeconds = DEMO_RETENTION.days * SECONDS_PER_DAY;
    const writeTotals = async (
      queue: string,
      metric: 'completed' | 'failed',
      days: Record<string, string>
    ) => {
      const key = `${DEMO_METRICS_NAMESPACE}:${queue}:${metric}:totals`;
      await redis.hset(key, days);
      await redis.expire(key, totalsTtlSeconds);
    };
    const globalCompletedStr: Record<string, string> = {};
    const globalFailedStr: Record<string, string> = {};
    for (const day of Object.keys(completedGlobal)) {
      globalCompletedStr[day] = String(completedGlobal[day]);
    }
    for (const day of Object.keys(failedGlobal)) {
      globalFailedStr[day] = String(failedGlobal[day]);
    }

    await Promise.all([
      ...profiles.map((profile) =>
        writeTotals(profile.name, 'completed', completedByQueue.get(profile.name)!)
      ),
      ...profiles.map((profile) =>
        writeTotals(profile.name, 'failed', failedByQueue.get(profile.name)!)
      ),
      writeTotals(DEMO_GLOBAL_QUEUE, 'completed', globalCompletedStr),
      writeTotals(DEMO_GLOBAL_QUEUE, 'failed', globalFailedStr),
    ]);

    await redis.set(DEMO_BACKFILL_MARKER_KEY, new Date().toISOString());
    console.log(
      `[demo] Seeded ${DEMO_BACKFILL_DAYS} days of demo metrics history (counters, latency, queue age) for ${profiles.length} queues plus the global rollup`
    );
  } finally {
    redis.disconnect();
  }
}

const run = async () => {
  const app = express();

  const ordersFulfillment = createQueueMQ('Orders.Fulfillment', retrying);
  const reportsExport = createQueue3('Reports.NightlyExport');
  const flow = new FlowProducer({ connection: redisOptions });

  setupBullProcessor(reportsExport);
  setupBullMQProcessor(ordersFulfillment.name);

  const newRegistration = createQueueMQ('Notifications.User.NewRegistration', { attempts: 2 });
  const resetPassword = createQueueMQ('Notifications;User;ResetPassword', { attempts: 2 });

  // Read-only on the board, so the difference between a queue you can act on and one you can
  // only watch is visible. Its retention options give the info panel something to show too.
  const auditLog = createQueueMQ('Compliance.AuditLog', {
    attempts: 1,
    removeOnComplete: { age: 604800, count: 5000 },
    removeOnFail: false,
  });

  const groupedQueues = groupedQueueDefs.map(([name, opts]) => createQueueMQ(name, opts));
  const simQueues = [...groupedQueues, newRegistration, resetPassword, auditLog];

  simQueues.forEach((queue) => setupSimWorker(queue.name));
  await Promise.all(simQueues.map(seedQueue));
  await seedFlows(flow, 'Media.Video.Transcode');
  await seedSchedulers(groupedQueues);

  const throttled = groupedQueues.find((queue) => queue.name === 'Notifications.Sms');
  await throttled?.setGlobalRateLimit(5, 30_000);
  setupSimWorker(`${throttled?.name}`);
  setInterval(() => {
    void throttled?.addBulk(
      Array.from({ length: 12 }, (_, i) => ({ name: 'sms', data: { seq: i, at: Date.now() } }))
    );
  }, 5000);

  await groupedQueues.find((queue) => queue.name === 'Webhooks.DeadLetter')?.pause();
  await groupedQueues.find((queue) => queue.name === 'Search.Reindex')?.pause();

  startTraffic(simQueues);

  app.use('/add', (req, res) => {
    const opts = req.query.opts || ({} as any);

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    if (opts.priority) {
      opts.priority = +opts.priority;
    }

    reportsExport.add({ title: req.query.title }, opts);
    ordersFulfillment.add('Add', { title: req.query.title }, opts);
    res.json({
      ok: true,
    });
  });

  app.use('/add-scheduled-job', async (req, res) => {
    const opts = req.query.opts || ({} as any);

    await ordersFulfillment.upsertJobScheduler(
      'my-scheduler-id',
      {
        every: +(opts.every || 1) * 1000,
        limit: +opts.limit || 4,
      },
      { name: req.query.title as string, opts }
    );

    res.json({
      ok: true,
    });
  });

  app.use('/add-flow', (req, res) => {
    const opts = req.query.opts || ({} as any);

    if (opts.delay) {
      opts.delay = +opts.delay * 1000; // delay must be a number
    }

    if (opts.priority) {
      opts.priority = +opts.priority;
    }

    flow.add({
      name: 'root-job',
      queueName: 'Orders.Fulfillment',
      data: {},
      opts,
      children: [
        {
          name: 'job-child1',
          data: { idx: 0, foo: 'bar' },
          queueName: 'Orders.Fulfillment',
          opts,
          children: [
            {
              name: 'job-grandchildren1',
              data: { idx: 4, foo: 'baz' },
              queueName: 'Orders.Fulfillment',
              opts,
              children: [
                {
                  name: 'job-child2',
                  data: { idx: 2, foo: 'foo' },
                  queueName: 'Orders.Fulfillment',
                  opts,
                  children: [
                    {
                      name: 'job-child3',
                      data: { idx: 3, foo: 'bis' },
                      queueName: 'Orders.Fulfillment',
                      opts,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    res.json({
      ok: true,
    });
  });

  const serverAdapter: any = new ExpressAdapter();
  serverAdapter.setBasePath('/ui');

  const bullMQAdapters = [
    new BullMQAdapter(ordersFulfillment, { delimiter: '.' }),
    ...groupedQueues.map((queue) => new BullMQAdapter(queue, { delimiter: '.' })),
    new BullMQAdapter(newRegistration, { delimiter: '.' }),
    new BullMQAdapter(auditLog, {
      delimiter: '.',
      displayName: 'Audit log',
      description: 'Append-only compliance trail. Read-only on the board.',
      readOnlyMode: true,
    }),
    new BullMQAdapter(resetPassword, {
      delimiter: ';',
      displayName: 'Reset Password',
      description: 'Sends a password-reset email to the requesting user.',
      jobDataSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['userId', 'email'],
        properties: {
          userId: { type: 'string', description: 'Internal id of the user requesting the reset.' },
          email: {
            type: 'string',
            format: 'email',
            description: 'Address the reset link is sent to.',
          },
          locale: {
            type: 'string',
            description: 'BCP-47 locale for the email template.',
            default: 'en',
          },
        },
      },
    }),
  ];

  // Formatters run on the way out, so a queue whose payload carries a secret can still be
  // inspected on the board without the secret being on the board.
  const resetPasswordAdapter = bullMQAdapters.find(
    (adapter) => adapter.getName() === resetPassword.name
  )!;
  resetPasswordAdapter.setFormatter('data', (data: Record<string, any>) => {
    if (!data || typeof data !== 'object') return data;
    const redacted: Record<string, any> = { ...data };
    for (const key of Object.keys(redacted)) {
      if (/token|secret|apikey|password/i.test(key)) redacted[key] = '***';
    }
    return redacted;
  });

  await backfillDemoHistory(bullMQAdapters.map((adapter) => adapter.getName()));

  const historyProvider = new RedisMetricsHistoryProvider({ connection: redisOptions });
  const recorder = new MetricsRecorder({ queues: bullMQAdapters, connection: redisOptions });
  recorder.start();

  createBullBoard({
    queues: [
      ...bullMQAdapters,
      new BullAdapter(reportsExport, {
        delimiter: '.',
        externalJobUrl: (job) => ({ href: `https://my-app.com/${job.id}` }),
      }),
    ],
    serverAdapter,
    options: {
      uiConfig: {
        showMetrics: true,
        overview: { groupByDelimiter: true },
      },
      historyProvider,
    },
  });

  app.use('/ui', serverAdapter.getRouter());

  app.listen(3000, () => {
    console.log('Running on 3000...');
    console.log('For the UI, open http://localhost:3000/ui');
    console.log('Make sure Redis is running on port 6379 by default');
    console.log('To populate the queue, run:');
    console.log('  curl http://localhost:3000/add?title=Example');
    console.log('To populate the queue with custom options (opts), run:');
    console.log('  curl http://localhost:3000/add?title=Test&opts[delay]=10');
  });
};

run().catch((e) => console.error(e));
