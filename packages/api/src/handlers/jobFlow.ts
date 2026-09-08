import type { Job, JobNode } from 'bullmq';
import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  FlowNode,
  QueueJob,
} from '../../typings/app';
import { GetJobFlowResponse } from '../../typings/responses';
import type { FlowWindow } from '../providers/flow';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

const DEFAULT_DEPTH = 10;
const MIN_DEPTH = 1;
const MAX_DEPTH = 20;
const DEFAULT_MAX_CHILDREN = 20;
const MIN_MAX_CHILDREN = 1;
const MAX_MAX_CHILDREN = 1000;
const MAX_FLOW_NODES = 200;

function readInt(raw: unknown, fallback: number, min: number, max: number): number {
  if (raw === '' || raw === null || raw === undefined) {
    return fallback;
  }

  const parsed = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : Number.NaN;
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export function readFlowWindow(query: Record<string, any>): FlowWindow {
  return {
    depth: readInt(query?.depth, DEFAULT_DEPTH, MIN_DEPTH, MAX_DEPTH),
    maxChildren: readInt(
      query?.maxChildren,
      DEFAULT_MAX_CHILDREN,
      MIN_MAX_CHILDREN,
      MAX_MAX_CHILDREN
    ),
  };
}

async function readDependencies(job: Job): Promise<Pick<FlowNode, 'dependencies'>> {
  if (typeof job.getDependenciesCount !== 'function') {
    return {};
  }

  const counts = await job
    .getDependenciesCount({ processed: true, unprocessed: true, ignored: true, failed: true })
    .catch(() => null);

  if (!counts) {
    return {};
  }

  const dependencies = {
    processed: counts.processed ?? 0,
    unprocessed: counts.unprocessed ?? 0,
    ignored: counts.ignored ?? 0,
    failed: counts.failed ?? 0,
  };

  return Object.values(dependencies).some(Boolean) ? { dependencies } : {};
}

async function readIgnoredFailures(
  job: Job,
  ignored: number
): Promise<Pick<FlowNode, 'ignoredChildFailureReasons'>> {
  if (!ignored || typeof job.getIgnoredChildrenFailures !== 'function') {
    return {};
  }

  const reasons = await job.getIgnoredChildrenFailures().catch(() => null);
  return reasons && Object.keys(reasons).length > 0 ? { ignoredChildFailureReasons: reasons } : {};
}

function countDependencies(dependencies: FlowNode['dependencies']): number {
  if (!dependencies) {
    return 0;
  }

  return (
    dependencies.processed + dependencies.unprocessed + dependencies.ignored + dependencies.failed
  );
}

function toFlowNode(node: JobNode): FlowNode {
  return {
    id: node.job.id as string,
    name: node.job.name,
    progress: node.job.progress,
    state: 'unknown',
    queueName: node.job.queueName,
    children: [],
  };
}

async function hydrate(job: Job, target: FlowNode, vanished: number): Promise<void> {
  const [state, dependencies] = await Promise.all([job.getState(), readDependencies(job)]);

  target.state = state;
  Object.assign(target, dependencies);
  Object.assign(target, await readIgnoredFailures(job, dependencies.dependencies?.ignored ?? 0));

  if (target.children.length + vanished < countDependencies(dependencies.dependencies)) {
    target.truncated = true;
  }
}

// One level of children costs a single hydration pass per child, so `maxChildren` already
// bounds it. Only a deeper window multiplies out and needs the flat cap.
function nodeBudget({ depth, maxChildren }: FlowWindow): number {
  return depth <= 2 ? Math.max(MAX_FLOW_NODES, maxChildren) : MAX_FLOW_NODES;
}

async function simplifyTree(
  root: JobNode | null | undefined,
  window: FlowWindow
): Promise<FlowNode | null> {
  if (!root || !root.job.id) {
    return null;
  }

  const budget = nodeBudget(window);
  const rootNode = toFlowNode(root);
  const hydrated: [Job, FlowNode][] = [[root.job, rootNode]];
  const vanished = new Map<FlowNode, number>();
  let frontier: [JobNode, FlowNode][] = [[root, rootNode]];
  let count = 1;

  while (frontier.length > 0) {
    const level = frontier;
    frontier = [];

    for (const [source, target] of level) {
      for (const child of (source.children || []).slice(0, window.maxChildren)) {
        // getFlow yields `undefined` once `removeOnComplete` has cleared a finished child.
        if (!child?.job?.id) {
          vanished.set(target, (vanished.get(target) ?? 0) + 1);
          continue;
        }
        if (count > budget) {
          target.truncated = true;
          continue;
        }

        const childNode = toFlowNode(child);
        target.children.push(childNode);
        hydrated.push([child.job, childNode]);
        frontier.push([child, childNode]);
        count += 1;
      }
    }
  }

  await Promise.all(
    hydrated.map(([job, target]) => hydrate(job, target, vanished.get(target) ?? 0))
  );

  return rootNode;
}

function emptyNodeResponse(nodeId: string) {
  return {
    status: 200 as const,
    body: {
      nodeId,
      flowRoot: null,
      isFlowNode: false,
    },
  };
}

async function getJobFlow(
  req: BullBoardRequest,
  job: QueueJob,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<GetJobFlowResponse>> {
  const jobId = (job as Job).id;
  if (queue.type !== 'bullmq') {
    return emptyNodeResponse(jobId!);
  }

  const { findFlowRoot, getFlowTree } = await import('../providers/flow'); // required to allow separation between bull & bullMQ
  const root =
    req.query?.root === 'node'
      ? { queueName: queue.getName(), jobId: jobId as string }
      : await findFlowRoot(req.queues, job as Job);

  if (!root) {
    return emptyNodeResponse(jobId!);
  }

  const window = readFlowWindow(req.query);
  const flowTree = await getFlowTree(req.queues, root.queueName, root.jobId, window);
  const rootSimplified = await simplifyTree(flowTree, window);

  return {
    status: 200,
    body: {
      nodeId: jobId!,
      isFlowNode: (rootSimplified?.children.length ?? 0) > 0,
      flowRoot: rootSimplified,
    },
  };
}

export const jobFlowHandler = queueProvider(jobProvider(getJobFlow), {
  skipReadOnlyModeCheck: true,
});
