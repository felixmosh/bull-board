import {
  ControllerHandlerReturnType,
  BullBoardRequest,
  QueueJob,
  FlowNode,
} from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';
import { flowProvider } from '../providers/flow';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import { BaseAdapter } from '../queueAdapters/base';
import { Job, JobNode } from 'bullmq';

const simplifyNode = async (node: JobNode): Promise<FlowNode | null> => {
  const state = await node.job.getState();
  const id = node.job.id;
  if (!id) {
    return null;
  }
  const children = (await Promise.all((node.children || []).map(simplifyNode))).filter(
    (n) => n !== null
  );

  return {
    id,
    name: node.job.name,
    progress: node.job.progress,
    state: state,
    queueName: node.job.queueName,
    children: children,
  };
};

async function getJobFlow(
  _req: BullBoardRequest,
  job: QueueJob,
  queue: BaseAdapter,
  flowTree: JobNode | null
): Promise<ControllerHandlerReturnType> {
  const jobId = (job as Job).id;
  if (!(queue instanceof BullMQAdapter) || !flowTree) {
    return {
      status: 200,
      body: {
        nodeId: jobId,
        flowRoot: null,
        isFlowNode: false,
      },
    };
  }

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

export const jobFlowHandler = queueProvider(jobProvider(flowProvider(getJobFlow)));
