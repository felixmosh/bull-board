import { http, HttpResponse } from 'msw';
import {
  countByStatus,
  DemoJob,
  DemoQueue,
  findJob,
  findQueue,
  nextJobId,
  state,
  Status,
} from './state';
import { seedFixtures } from './fixtures';

// Populate the store on first import.
seedFixtures(state);

const BASE = '/bull-board/demo/api';

type JobState = Exclude<Status, 'latest'>;

const ALL_JOB_STATES: JobState[] = [
  'active',
  'waiting',
  'waiting-children',
  'prioritized',
  'completed',
  'failed',
  'delayed',
  'paused',
];

// Queues marked as "formatted" demonstrate custom data formatters. Sensitive
// fields (like API keys) are redacted server-side before the UI ever sees
// them — mirrors what `BaseAdapter#setFormatter('data', fn)` does in real
// adapters. See packages/api/src/queueAdapters/base.ts.
const FORMATTED_QUEUES = new Set<string>(['billing:invoices']);

function formatData(queueName: string, data: unknown): unknown {
  if (!FORMATTED_QUEUES.has(queueName)) return data;
  if (!data || typeof data !== 'object') return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const key of Object.keys(out)) {
    if (/apikey|secret|token|password/i.test(key)) {
      out[key] = '***';
    }
  }
  return out;
}

function serializeJob(job: DemoJob) {
  return {
    id: job.id,
    name: job.name,
    timestamp: job.timestamp,
    processedOn: job.processedOn ?? null,
    processedBy: job.processedBy ?? null,
    finishedOn: job.finishedOn ?? null,
    progress: job.progress,
    attempts: job.attempts,
    failedReason: job.failedReason,
    stacktrace: job.stacktrace,
    delay: job.delay,
    opts: job.opts,
    data: formatData(job.queueName, job.data),
    returnValue: job.returnValue,
    isFailed: job.isFailed,
    externalUrl: job.externalUrl,
  };
}

function jobsForQueue(
  queue: DemoQueue,
  isActive: boolean,
  status: string | null,
  page: number,
  jobsPerPage: number
) {
  if (!isActive) {
    return { jobs: [] as DemoJob[], pagination: { pageCount: 1, range: { start: 0, end: jobsPerPage - 1 } } };
  }

  const isLatest = !status || status === 'latest';
  if (isLatest) {
    // "latest" concatenates first `jobsPerPage` of each state.
    const flat: DemoJob[] = [];
    for (const s of ALL_JOB_STATES) {
      const inState = queue.jobs.filter((j) => j.state === s).slice(0, jobsPerPage);
      flat.push(...inState);
    }
    return {
      jobs: flat,
      pagination: { pageCount: 1, range: { start: 0, end: jobsPerPage - 1 } },
    };
  }

  const filtered = queue.jobs.filter((j) => j.state === status);
  const start = (page - 1) * jobsPerPage;
  const end = start + jobsPerPage;
  const pageJobs = filtered.slice(start, end);
  return {
    jobs: pageJobs,
    pagination: {
      pageCount: Math.max(1, Math.ceil(filtered.length / jobsPerPage)),
      range: { start, end: end - 1 },
    },
  };
}

function serializeQueue(
  queue: DemoQueue,
  isActive: boolean,
  status: string | null,
  page: number,
  jobsPerPage: number
) {
  const { jobs, pagination } = jobsForQueue(queue, isActive, status, page, jobsPerPage);
  return {
    name: queue.name,
    displayName: queue.displayName,
    description: queue.description,
    type: queue.type,
    delimiter: queue.delimiter,
    isPaused: queue.isPaused,
    readOnlyMode: queue.readOnlyMode,
    allowRetries: queue.allowRetries,
    allowCompletedRetries: queue.allowCompletedRetries,
    globalConcurrency: queue.globalConcurrency,
    statuses: queue.statuses,
    counts: countByStatus(queue),
    pagination,
    jobs: jobs.map(serializeJob),
  };
}

function decode(value: string | undefined | null): string | null {
  if (value == null) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildFlowNode(job: DemoJob): any {
  const children: any[] = [];
  if (job.childRefs) {
    for (const ref of job.childRefs) {
      const childJob = findJob(ref.queueName, ref.jobId);
      if (childJob) children.push(buildFlowNode(childJob));
    }
  }
  return {
    id: job.id,
    name: job.name,
    progress: job.progress,
    state: job.state,
    queueName: job.queueName,
    children,
  };
}

function findFlowRoot(job: DemoJob): DemoJob {
  let current = job;
  const guard = new Set<string>();
  while (current.parentKey && !guard.has(String(current.id))) {
    guard.add(String(current.id));
    // parentKey format: `bull:<queueName>:<jobId>`
    const m = current.parentKey.match(/^bull:(.+):(\d+)$/);
    if (!m) break;
    const [, queueName, parentId] = m;
    const parent = findJob(queueName, parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

export const handlers = [
  http.get(`${BASE}/queues`, ({ request }) => {
    const url = new URL(request.url);
    const activeQueue = decode(url.searchParams.get('activeQueue'));
    const status = decode(url.searchParams.get('status'));
    const page = Number(url.searchParams.get('page')) || 1;
    const jobsPerPage = Number(url.searchParams.get('jobsPerPage')) || 10;

    const queues = state.queues.map((q) =>
      serializeQueue(q, q.name === activeQueue, status, page, jobsPerPage)
    );

    return HttpResponse.json({ queues });
  }),

  http.get(`${BASE}/redis/stats`, () =>
    HttpResponse.json({
      version: '7.2.4',
      mode: 'standalone',
      port: 6379,
      os: 'Linux 5.15.0 demo-host x86_64',
      uptime: 86400 * 3 + 7200,
      memory: {
        total: 1024 * 1024 * 1024 * 8, // 8 GB
        used: 1024 * 1024 * 512, // 512 MB
        fragmentationRatio: 1.18,
        peak: 1024 * 1024 * 768,
      },
      clients: {
        connected: 34,
        blocked: 0,
      },
    })
  ),

  http.get<{ queueName: string; jobId: string }>(
    `${BASE}/queues/:queueName/:jobId/logs`,
    ({ params }) => {
      const queueName = decode(params.queueName) ?? '';
      const jobId = decode(params.jobId) ?? '';
      const job = findJob(queueName, jobId);
      if (!job) return new HttpResponse('Job not found', { status: 404 });
      return HttpResponse.json(job.logs);
    }
  ),

  http.get<{ queueName: string; jobId: string }>(
    `${BASE}/queues/:queueName/:jobId/flow`,
    ({ params }) => {
      const queueName = decode(params.queueName) ?? '';
      const jobId = decode(params.jobId) ?? '';
      const job = findJob(queueName, jobId);
      if (!job) return new HttpResponse('Job not found', { status: 404 });

      const root = findFlowRoot(job);
      const rootHasChildren = !!root.childRefs && root.childRefs.length > 0;
      if (!rootHasChildren && !job.parentKey) {
        return HttpResponse.json({ nodeId: job.id, isFlowNode: false, flowRoot: null });
      }
      return HttpResponse.json({
        nodeId: job.id,
        isFlowNode: rootHasChildren,
        flowRoot: buildFlowNode(root),
      });
    }
  ),

  http.get<{ queueName: string; jobId: string }>(
    `${BASE}/queues/:queueName/:jobId`,
    ({ params }) => {
      const queueName = decode(params.queueName) ?? '';
      const jobId = decode(params.jobId) ?? '';
      const job = findJob(queueName, jobId);
      if (!job) return new HttpResponse('Job not found', { status: 404 });
      return HttpResponse.json({ job: serializeJob(job), status: job.state });
    }
  ),

  http.post<{ queueName: string }>(
    `${BASE}/queues/:queueName/add`,
    async ({ params, request }) => {
      const queueName = decode(params.queueName) ?? '';
      const queue = findQueue(queueName);
      if (!queue) return new HttpResponse('Queue not found', { status: 404 });
      const body = (await request.json().catch(() => ({}))) as {
        name?: string;
        data?: unknown;
        options?: Record<string, unknown>;
      };
      const job: DemoJob = {
        id: nextJobId(),
        name: body.name || 'manual',
        timestamp: Date.now(),
        processedOn: null,
        processedBy: null,
        finishedOn: null,
        progress: 0,
        attempts: 0,
        failedReason: '',
        stacktrace: [],
        delay: (body.options?.delay as number | undefined) ?? undefined,
        opts: body.options ?? {},
        data: body.data,
        returnValue: null,
        isFailed: false,
        state: (body.options?.delay as number | undefined) ? 'delayed' : 'waiting',
        queueName,
        logs: [`[${new Date().toISOString()}] job enqueued from the demo add-job dialog`],
      };
      queue.jobs.unshift(job);
      return HttpResponse.json({ job: serializeJob(job), status: job.state });
    }
  ),

  http.put<{ queueName: string; queueStatus: string }>(
    `${BASE}/queues/:queueName/retry/:queueStatus`,
    ({ params }) => {
      const queueName = decode(params.queueName) ?? '';
      const statusParam = decode(params.queueStatus) as JobState;
      const queue = findQueue(queueName);
      if (!queue) return new HttpResponse('Queue not found', { status: 404 });
      for (const job of queue.jobs) {
        if (job.state === statusParam) {
          job.state = 'waiting';
          job.attempts += 1;
          job.failedReason = '';
          job.stacktrace = [];
          job.isFailed = false;
          job.finishedOn = null;
        }
      }
      return HttpResponse.json({});
    }
  ),

  http.put<{ queueName: string }>(
    `${BASE}/queues/:queueName/promote`,
    ({ params }) => {
      const queueName = decode(params.queueName) ?? '';
      const queue = findQueue(queueName);
      if (!queue) return new HttpResponse('Queue not found', { status: 404 });
      for (const job of queue.jobs) {
        if (job.state === 'delayed') {
          job.state = 'waiting';
          delete job.delay;
        }
      }
      return HttpResponse.json({});
    }
  ),

  http.put<{ queueName: string; queueStatus: string }>(
    `${BASE}/queues/:queueName/clean/:queueStatus`,
    ({ params }) => {
      const queueName = decode(params.queueName) ?? '';
      const statusParam = decode(params.queueStatus) as JobState;
      const queue = findQueue(queueName);
      if (!queue) return new HttpResponse('Queue not found', { status: 404 });
      queue.jobs = queue.jobs.filter((j) => j.state !== statusParam);
      return HttpResponse.json({});
    }
  ),

  http.put<{ queueName: string }>(
    `${BASE}/queues/:queueName/pause`,
    ({ params }) => {
      const queue = findQueue(decode(params.queueName) ?? '');
      if (!queue) return new HttpResponse('Queue not found', { status: 404 });
      queue.isPaused = true;
      return HttpResponse.json({});
    }
  ),

  http.put<{ queueName: string }>(
    `${BASE}/queues/:queueName/resume`,
    ({ params }) => {
      const queue = findQueue(decode(params.queueName) ?? '');
      if (!queue) return new HttpResponse('Queue not found', { status: 404 });
      queue.isPaused = false;
      return HttpResponse.json({});
    }
  ),

  http.put(`${BASE}/queues/pause`, () => {
    for (const q of state.queues) q.isPaused = true;
    return HttpResponse.json({});
  }),

  http.put(`${BASE}/queues/resume`, () => {
    for (const q of state.queues) q.isPaused = false;
    return HttpResponse.json({});
  }),

  http.put<{ queueName: string }>(
    `${BASE}/queues/:queueName/concurrency`,
    async ({ params, request }) => {
      const queue = findQueue(decode(params.queueName) ?? '');
      if (!queue) return new HttpResponse('Queue not found', { status: 404 });
      const body = (await request.json().catch(() => ({}))) as { concurrency?: number };
      queue.globalConcurrency = body.concurrency ?? null;
      return HttpResponse.json({});
    }
  ),

  http.put<{ queueName: string }>(
    `${BASE}/queues/:queueName/empty`,
    ({ params }) => {
      const queue = findQueue(decode(params.queueName) ?? '');
      if (!queue) return new HttpResponse('Queue not found', { status: 404 });
      queue.jobs = [];
      return HttpResponse.json({});
    }
  ),

  http.put<{ queueName: string }>(
    `${BASE}/queues/:queueName/obliterate`,
    ({ params }) => {
      const queueName = decode(params.queueName) ?? '';
      const queue = findQueue(queueName);
      if (!queue) return new HttpResponse('Queue not found', { status: 404 });
      queue.jobs = [];
      state.queues = state.queues.filter((q) => q.name !== queueName);
      return HttpResponse.json({});
    }
  ),

  http.put<{ queueName: string; jobId: string }>(
    `${BASE}/queues/:queueName/:jobId/retry`,
    ({ params }) => {
      const job = findJob(decode(params.queueName) ?? '', decode(params.jobId) ?? '');
      if (!job) return new HttpResponse('Job not found', { status: 404 });
      job.state = 'waiting';
      job.attempts += 1;
      job.failedReason = '';
      job.stacktrace = [];
      job.isFailed = false;
      job.finishedOn = null;
      return HttpResponse.json({});
    }
  ),

  http.put<{ queueName: string; jobId: string }>(
    `${BASE}/queues/:queueName/:jobId/clean`,
    ({ params }) => {
      const queueName = decode(params.queueName) ?? '';
      const jobId = decode(params.jobId) ?? '';
      const queue = findQueue(queueName);
      if (!queue) return new HttpResponse('Queue not found', { status: 404 });
      queue.jobs = queue.jobs.filter((j) => String(j.id) !== jobId);
      return HttpResponse.json({});
    }
  ),

  http.put<{ queueName: string; jobId: string }>(
    `${BASE}/queues/:queueName/:jobId/promote`,
    ({ params }) => {
      const job = findJob(decode(params.queueName) ?? '', decode(params.jobId) ?? '');
      if (!job) return new HttpResponse('Job not found', { status: 404 });
      if (job.state === 'delayed') {
        job.state = 'waiting';
        delete job.delay;
      }
      return HttpResponse.json({});
    }
  ),

  http.patch<{ queueName: string; jobId: string }>(
    `${BASE}/queues/:queueName/:jobId/update-data`,
    async ({ params, request }) => {
      const job = findJob(decode(params.queueName) ?? '', decode(params.jobId) ?? '');
      if (!job) return new HttpResponse('Job not found', { status: 404 });
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      job.data = body;
      return HttpResponse.json({});
    }
  ),
];
