import type { Job, JobNode } from 'bullmq';
import type {
  BullBoardRequest,
  ControllerHandlerReturnType,
  FlowNode,
  QueueJob,
} from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

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

async function simplifyNode(node: JobNode | null | undefined): Promise<FlowNode | null> {
  if (!node || !node.job.id) {
    return null;
  }

  const [children, state, dependencies] = await Promise.all([
    Promise.all((node.children || []).map(simplifyNode)),
    node.job.getState(),
    readDependencies(node.job),
  ]);

  return {
    id: node.job.id,
    name: node.job.name,
    progress: node.job.progress,
    state,
    queueName: node.job.queueName,
    children: children.filter((n) => !!n),
    ...dependencies,
    ...(await readIgnoredFailures(node.job, dependencies.dependencies?.ignored ?? 0)),
  };
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
): Promise<ControllerHandlerReturnType> {
  const jobId = (job as Job).id;
  if (queue.type !== 'bullmq') {
    return emptyNodeResponse(jobId!);
  }

  const { findFlowRoot, getFlowTree } = await import('../providers/flow'); // required to allow separation between bull & bullMQ
  const root = await findFlowRoot(req.queues, job as Job);

  if (!root) {
    return emptyNodeResponse(jobId!);
  }

  const flowTree = await getFlowTree(req.queues, root.queueName, root.jobId);
  const rootSimplified = await simplifyNode(flowTree);

  return {
    status: 200,
    body: {
      nodeId: jobId,
      isFlowNode: (rootSimplified?.children.length ?? 0) > 0,
      flowRoot: rootSimplified,
    },
  };
}

export const jobFlowHandler = queueProvider(jobProvider(getJobFlow), {
  skipReadOnlyModeCheck: true,
});
