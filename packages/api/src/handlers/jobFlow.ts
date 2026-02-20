import {
  ControllerHandlerReturnType,
  BullBoardRequest,
  QueueJob,
  FlowNode,
} from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';
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
    children: children,
  };
};

async function getJobFlow(
  _req: BullBoardRequest,
  job: QueueJob,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  let jobId = (job as Job).id;
  if (!(queue instanceof BullMQAdapter)) {
    return {
      status: 200,
      body: {
        nodeId: jobId,
        flowRoot: null,
        isFlowNode: false,
      },
    };
  }

  let currJob = job as Job;
  let flowRoot: JobNode | null = null;
  while (currJob) {
    const parentKey = currJob.parentKey;
    if (!parentKey) {
      if (!currJob.id) break;
      flowRoot = await queue.getFlowTree(currJob.id);
      break;
    }
    const parentId = parentKey.split(':').pop();
    const parentJob = await queue.getJob(parentId as string);
    if (!parentJob) break;
    currJob = parentJob as Job;
  }
  if (!flowRoot) {
    return {
      status: 200,
      body: {
        nodeId: jobId,
        flowRoot: null,
        isFlowNode: false,
      },
    };
  }
  const rootSimplified = await simplifyNode(flowRoot);
  return {
    status: 200,
    body: {
      nodeId: jobId,
      isFlowNode: (rootSimplified?.children.length ?? 0) > 0,
      flowRoot: rootSimplified,
    },
  };
}

export const jobFlowHandler = queueProvider(jobProvider(getJobFlow));
