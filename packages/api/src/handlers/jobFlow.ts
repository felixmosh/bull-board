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

async function simplifyNode(node: JobNode | null | undefined): Promise<FlowNode | null> {
  if (!node || !node.job.id) {
    return null;
  }

  const children = await Promise.all((node.children || []).map(simplifyNode));

  const state = await node.job.getState();

  return {
    id: node.job.id,
    name: node.job.name,
    progress: node.job.progress,
    state,
    queueName: node.job.queueName,
    children: children.filter((n) => !!n),
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
