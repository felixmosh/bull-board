import { createBullBoard } from '@bull-board/api';
import { appRoutes } from '@bull-board/api/dist/routes';
import type { BullBoardRequest, ControllerHandlerReturnType } from '@bull-board/api/typings/app';
import { seedFixtures } from './fixtures';
import { findJob, state } from './state';
import type { DemoJob } from './state';
import { MockAdapter } from './MockAdapter';
import { MSWServerAdapter } from './MSWServerAdapter';

seedFixtures(state);

// ---- local mock for the flow endpoint (avoids pulling in bullmq) ----

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
    const m = current.parentKey.match(/^bull:(.+):(\d+)$/);
    if (!m) break;
    const [, queueName, parentId] = m;
    const parent = findJob(queueName, parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

async function mockJobFlowHandler(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const { queueName, jobId } = req.params;
  const job = findJob(queueName, jobId);
  if (!job) return { status: 404, body: { error: 'Job not found' } };

  const root = findFlowRoot(job);
  const rootHasChildren = !!root.childRefs && root.childRefs.length > 0;
  if (!rootHasChildren && !job.parentKey) {
    return {
      status: 200,
      body: { nodeId: job.id, isFlowNode: false, flowRoot: null },
    };
  }
  return {
    status: 200,
    body: {
      nodeId: job.id,
      isFlowNode: rootHasChildren,
      flowRoot: buildFlowNode(root),
    },
  };
}

// ---- wire it up via the real createBullBoard ----

const mockAdapters = state.queues.map((q) => {
  const adapter = new MockAdapter(q);
  if (q.name === 'billing:invoices') {
    adapter.setFormatter('data', (data: unknown) => {
      if (!data || typeof data !== 'object') return data;
      const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
      for (const key of Object.keys(out)) {
        if (/apikey|secret|token|password/i.test(key)) {
          out[key] = '***';
        }
      }
      return out;
    });
  }
  return adapter;
});

const serverAdapter = new MSWServerAdapter();
serverAdapter.setBasePath('/bull-board/demo');

createBullBoard({
  queues: mockAdapters,
  serverAdapter,
  options: {
    uiBasePath: '/bull-board/demo',
    uiConfig: {
      boardTitle: 'bull-board demo',
      boardLogo: { path: '/bull-board/demo/logo.svg', width: 32, height: 32 },
      environment: { label: 'demo', color: '#f59f00', textColor: '#000' },
      pollingInterval: { showSetting: true },
      sortQueues: true,
      miscLinks: [],
      hideDocsLink: false,
    },
  },
});

// Replace the flow handler with the mock (real one needs bullmq which isn't browser-safe)
serverAdapter.setApiRoutes(
  appRoutes.api.map((route) =>
    route.route === '/api/queues/:queueName/:jobId/flow'
      ? { ...route, handler: mockJobFlowHandler }
      : route
  )
);

export const handlers = serverAdapter.getHandlers();
