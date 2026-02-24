import { BullBoardQueues, BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { BaseAdapter } from '../queueAdapters/base';
import { FlowProducer, Job, JobNode } from 'bullmq';
import { BullMQAdapter } from '../queueAdapters/bullMQ';

// WeakMap keyed by Redis client so each distinct connection gets its own
// FlowProducer, and the entry is automatically freed when the client is GC'd.
const flowProducerCache = new WeakMap<object, FlowProducer>();

function findBullMQAdapter(queues: BullBoardQueues): BullMQAdapter | null {
  for (const adapter of queues.values()) {
    if (adapter.type === 'bullmq') {
      return adapter as unknown as BullMQAdapter;
    }
  }
  return null;
}

async function getFlowProducer(queues: BullBoardQueues): Promise<FlowProducer | null> {
  const adapter = findBullMQAdapter(queues);
  if (!adapter) return null;

  const client = await adapter.getClient();
  const cached = flowProducerCache.get(client);
  if (cached) return cached;

  const producer = new FlowProducer({ connection: client });
  flowProducerCache.set(client, producer);
  return producer;
}

/**
 * Builds a lookup from raw BullMQ queue name to adapter.
 * Rebuilt on each call to stay consistent with dynamic queue changes.
 */
function buildQueueNameLookup(queues: BullBoardQueues): Map<string, BullMQAdapter> {
  const lookup = new Map<string, BullMQAdapter>();
  for (const adapter of queues.values()) {
    if (adapter.type === 'bullmq') {
      const bmq = adapter as unknown as BullMQAdapter;
      lookup.set(bmq.getName(), bmq);
    }
  }
  return lookup;
}

async function getFlowTree(queues: BullBoardQueues, queueName: string, jobId: string): Promise<JobNode | null> {
  const producer = await getFlowProducer(queues);
  if (!producer) return null;
  const flowRoot = await producer.getFlow({ queueName, id: jobId }).catch(() => null);
  return flowRoot;
}

function simplifyQueueName(queueName: string, lookup: Map<string, BullMQAdapter>): string {
  const simpleQueueName = Array.from(lookup.keys()).find(
    key => queueName === key || queueName.endsWith(':' + key)
  );
  return simpleQueueName || queueName;
}

/**
 * Traverses the parent chain of a job across queues to find the flow root.
 * Returns the raw BullMQ queue name and job ID of the root, or null if
 * no flow root can be determined.
 */
async function findFlowRoot(
  queues: BullBoardQueues,
  job: Job
): Promise<{ queueName: string; jobId: string } | null> {
  const lookup = buildQueueNameLookup(queues);
  let currJob = job;
  while (currJob) {
    const currQueueName = simplifyQueueName(currJob.queueName, lookup);
    const parent = currJob.opts?.parent;
    if (!parent?.id || !parent?.queue) {
      if (!currJob.id) {
        return null;
      }
      return { queueName: currQueueName, jobId: currJob.id };
    }

    const parentQueueName = parent.queue;
    const simpleParentQueueName = simplifyQueueName(parentQueueName, lookup);
    const parentAdapter = simpleParentQueueName ? lookup.get(simpleParentQueueName) : null;

    if (!parentAdapter) {
      return null;
    }

    const parentJob = await parentAdapter.getJob(parent.id);
    if (!parentJob) {
      return null;
    }

    currJob = parentJob as Job;
  }

  return null;
}

export function flowProvider(
  next: (
    req: BullBoardRequest,
    job: QueueJob,
    queue: BaseAdapter,
    flowTree: JobNode | null
  ) => Promise<ControllerHandlerReturnType>
) {
  return async (
    req: BullBoardRequest,
    job: QueueJob,
    queue: BaseAdapter
  ): Promise<ControllerHandlerReturnType> => {
    const root = queue instanceof BullMQAdapter ? await findFlowRoot(req.queues, job as Job) : null;
    const flowTree = root ? await getFlowTree(req.queues, root.queueName, root.jobId) : null;
    return next(req, job, queue, flowTree);
  };
}
