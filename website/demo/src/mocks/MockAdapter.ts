import { BaseAdapter } from '@bull-board/api/dist/queueAdapters/base.js';
import type {
  JobCleanStatus,
  JobCounts,
  JobStatus,
  MetricsType,
  QueueJob,
  QueueJobOptions,
  QueueMetrics,
  Status,
} from '@bull-board/api/typings/app';
import { MockQueueJob } from './MockQueueJob';
import type { DemoJob, DemoQueue } from './state';
import { countByStatus, nextJobId, state } from './state';

const ALL_JOB_STATES: JobStatus[] = [
  'active',
  'waiting',
  'waiting-children',
  'prioritized',
  'completed',
  'failed',
  'delayed',
  'paused',
];

const METRICS_WINDOW = 60;

// Deterministic per-queue noise so the metrics chart is stable across reloads
// (a flickering demo would make for a jittery screenshot).
function hashStr(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockAdapter extends BaseAdapter {
  constructor(protected mockQueue: DemoQueue) {
    super('bullmq', {
      readOnlyMode: mockQueue.readOnlyMode,
      allowRetries: mockQueue.allowRetries,
      allowCompletedRetries: mockQueue.allowCompletedRetries,
      prefix: '',
      description: mockQueue.description ?? '',
      displayName: mockQueue.displayName ?? '',
      delimiter: mockQueue.delimiter,
    });
  }

  getName(): string {
    return this.mockQueue.name;
  }

  getStatuses(): Status[] {
    return ['latest', ...ALL_JOB_STATES];
  }

  getJobStatuses(): JobStatus[] {
    return ALL_JOB_STATES;
  }

  async getJobCounts(): Promise<JobCounts> {
    return countByStatus(this.mockQueue);
  }

  async isPaused(): Promise<boolean> {
    return this.mockQueue.isPaused;
  }

  async pause(): Promise<void> {
    this.mockQueue.isPaused = true;
  }

  async resume(): Promise<void> {
    this.mockQueue.isPaused = false;
  }

  async empty(): Promise<void> {
    this.mockQueue.jobs = [];
  }

  async obliterate(): Promise<void> {
    this.mockQueue.jobs = [];
    state.queues = state.queues.filter((q) => q.name !== this.mockQueue.name);
  }

  async getJobs(jobStatuses: JobStatus[], start?: number, end?: number): Promise<QueueJob[]> {
    const filtered = this.mockQueue.jobs.filter((j) => jobStatuses.includes(j.state));
    const slice = filtered.slice(start ?? 0, (end ?? filtered.length - 1) + 1);
    return slice.map((j) => new MockQueueJob(j));
  }

  async getJob(id: string): Promise<QueueJob | null> {
    const demo = this.mockQueue.jobs.find((j) => String(j.id) === String(id));
    return demo ? new MockQueueJob(demo) : null;
  }

  async getJobLogs(id: string): Promise<string[]> {
    const job = this.mockQueue.jobs.find((j) => String(j.id) === String(id));
    return job?.logs ?? [];
  }

  async clean(queueStatus: JobCleanStatus, _graceTimeMs: number): Promise<void> {
    const mappedState = queueStatus === 'wait' ? 'waiting' : queueStatus;
    this.mockQueue.jobs = this.mockQueue.jobs.filter((j) => j.state !== mappedState);
  }

  async addJob(name: string, data: unknown, options: QueueJobOptions): Promise<QueueJob> {
    const job: DemoJob = {
      id: nextJobId(),
      name,
      timestamp: Date.now(),
      processedOn: null,
      processedBy: null,
      finishedOn: null,
      progress: 0,
      attempts: 0,
      failedReason: '',
      stacktrace: [],
      delay: (options?.delay as number | undefined) ?? undefined,
      opts: (options ?? {}) as Record<string, unknown>,
      data,
      returnValue: null,
      isFailed: false,
      state: options?.delay ? 'delayed' : 'waiting',
      queueName: this.mockQueue.name,
      logs: [`[${new Date().toISOString()}] job enqueued via demo`],
    };
    this.mockQueue.jobs.unshift(job);
    return new MockQueueJob(job);
  }

  async promoteAll(): Promise<void> {
    for (const j of this.mockQueue.jobs) {
      if (j.state === 'delayed') {
        j.state = 'waiting';
        delete j.delay;
      }
    }
  }

  async getRedisInfo(): Promise<string> {
    return [
      '# Server',
      'redis_version:7.2.4',
      'redis_mode:standalone',
      'tcp_port:6379',
      'os:Linux 5.15.0 demo-host x86_64',
      'uptime_in_seconds:331200',
      '',
      '# Memory',
      'used_memory:536870912',
      'maxmemory:8589934592',
      'total_system_memory:8589934592',
      'mem_fragmentation_ratio:1.18',
      'used_memory_peak:805306368',
      '',
      '# Clients',
      'connected_clients:34',
      'blocked_clients:0',
      '',
    ].join('\n');
  }

  async getMetrics(type: MetricsType): Promise<QueueMetrics> {
    const isCompleted = type === 'completed';
    const seed = hashStr(`${this.mockQueue.name}:${type}`);
    const rand = mulberry32(seed);
    const phase = ((seed % 1000) / 1000) * Math.PI * 2;
    const base = isCompleted ? 16 : 2;
    const amp = isCompleted ? 11 : 3;

    // Per-minute buckets, newest first (index 0 === one minute ago).
    const data: number[] = [];
    for (let i = 0; i < METRICS_WINDOW - 1; i++) {
      const wave = Math.sin((i / (METRICS_WINDOW - 1)) * Math.PI * 4 + phase);
      let value = Math.round(base + amp * wave * 0.6 + (rand() - 0.5) * amp);
      if (!isCompleted && rand() > 0.85) {
        value += Math.round(rand() * 6); // occasional failure spike
      }
      data.push(Math.max(0, value));
    }

    const processed = 1000 + (seed % 5000);
    const live = Math.max(0, Math.round(base + (rand() - 0.5) * amp));
    return {
      // prevTS ≈ now keeps the series aligned to "now" (no idle gap) in the UI.
      meta: { count: processed + live, prevCount: processed, prevTS: Date.now() },
      data,
      count: processed + live,
    };
  }

  async getGlobalConcurrency(): Promise<number | null> {
    return this.mockQueue.globalConcurrency ?? null;
  }

  async setGlobalConcurrency(concurrency: number): Promise<void> {
    this.mockQueue.globalConcurrency = concurrency;
  }

  async removeJobScheduler(_id: string): Promise<boolean> {
    return false;
  }
}
