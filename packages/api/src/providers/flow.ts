import type { FlowProducer, Job, JobNode } from 'bullmq';
import { BullBoardQueues } from '../../typings/app';
import { BullMQAdapter } from '../queueAdapters/bullMQ';

function findBullMQAdapter(queues: BullBoardQueues): BullMQAdapter | null {
  for (const adapter of queues.values()) {
    if (adapter.type === 'bullmq') {
      return adapter as unknown as BullMQAdapter;
    }
  }
  return null;
}

// The producer comes from the flow root's own adapter, so on a board mixing backends or
// connections the tree is read from the datastore it lives in. The first bullmq adapter is
// only a fallback for a root whose queue is not registered on the board.
function getFlowProducer(queues: BullBoardQueues, queueName: string): Promise<FlowProducer | null> {
  const adapter = buildQueueNameLookup(queues).get(queueName) ?? findBullMQAdapter(queues);
  return adapter ? adapter.getFlowProducer() : Promise.resolve(null);
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

export async function getFlowTree(
  queues: BullBoardQueues,
  queueName: string,
  jobId: string
): Promise<JobNode | null> {
  const producer = await getFlowProducer(queues, queueName);
  if (!producer) return null;

  return await producer.getFlow({ queueName, id: jobId }).catch(() => null);
}

function simplifyQueueName(queueName: string, lookup: Map<string, BullMQAdapter>): string {
  const simpleQueueName = Array.from(lookup.keys()).find(
    (key) => queueName === key || queueName.endsWith(':' + key)
  );
  return simpleQueueName || queueName;
}

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
