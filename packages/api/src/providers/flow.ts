import { FlowProducer, type Job, type JobNode } from 'bullmq';
import { BullBoardQueues } from '../../typings/app';
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
      const rawName = bmq.getName().slice(bmq.prefix.length);
      lookup.set(rawName, bmq);
    }
  }
  return lookup;
}

export async function getFlowTree(
  queues: BullBoardQueues,
  queueName: string,
  jobId: string
): Promise<JobNode | null> {
  const producer = await getFlowProducer(queues);
  if (!producer) return null;

  return await producer.getFlow({ queueName, id: jobId }).catch(() => null);
}

function simplifyQueueName(queueName: string, lookup: Map<string, BullMQAdapter>): string {
  const simpleQueueName = Array.from(lookup.keys()).find(
    (key) => queueName === key || queueName.endsWith(':' + key)
  );
  return simpleQueueName || queueName;
}

const MAX_PARENT_DEPTH = 100;

/**
 * Traverses the parent chain of a job across queues to find the flow root.
 * Returns the raw BullMQ queue name and job ID of the root, or null if
 * no flow root can be determined.
 */
export async function findFlowRoot(
  queues: BullBoardQueues,
  job: Job
): Promise<{ queueName: string; jobId: string } | null> {
  const lookup = buildQueueNameLookup(queues);
  let currJob = job;
  for (let depth = 0; depth < MAX_PARENT_DEPTH; depth++) {
    const currQueueName = simplifyQueueName(currJob.queueName, lookup);
    const parent = currJob.opts?.parent;
    if (!parent?.id || !parent?.queue) {
      if (!currJob.id) {
        return null;
      }
      return { queueName: currQueueName, jobId: currJob.id };
    }

    const simpleParentQueueName = simplifyQueueName(parent.queue, lookup);
    const parentAdapter = lookup.get(simpleParentQueueName);

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
