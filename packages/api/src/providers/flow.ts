import type { Job, JobNode } from 'bullmq';
import { BullMQAdapter } from '../queueAdapters/bullMQ';
import { BullBoardQueues } from '../types';

function findBullMQAdapter(queues: BullBoardQueues): BullMQAdapter | null {
  for (const adapter of queues.values()) {
    if (adapter.type === 'bullmq') {
      return adapter as unknown as BullMQAdapter;
    }
  }
  return null;
}

function findBoardAdapter(queues: BullBoardQueues, boardQueueName: string): BullMQAdapter | null {
  const adapter = queues.get(boardQueueName);
  return adapter?.type === 'bullmq' ? (adapter as unknown as BullMQAdapter) : null;
}

// Keyed by the qualified `prefix:name`, which is what a job's `opts.parent.queue` carries and the
// only form that tells two board entries running one queue name under two prefixes apart.
function buildQueueLookup(queues: BullBoardQueues): Map<string, BullMQAdapter> {
  const lookup = new Map<string, BullMQAdapter>();

  for (const adapter of queues.values()) {
    if (adapter.type === 'bullmq') {
      const bmq = adapter as unknown as BullMQAdapter;
      lookup.set(bmq.getQueueQualifiedName(), bmq);
    }
  }

  return lookup;
}

export interface FlowWindow {
  depth: number;
  maxChildren: number;
}

// A queue is registered on the board under `prefix` + the name BullMQ knows it by, and job URLs
// and every other route are keyed by that rather than by the name a job reports.
export function buildBoardQueueNameResolver(queues: BullBoardQueues): (job: Job) => string {
  const lookup = buildQueueLookup(queues);
  return (job) => lookup.get(job.queueQualifiedName)?.getName() ?? job.queueName;
}

// The producer comes from the flow root's own adapter, so on a board mixing backends or
// connections the tree is read from the datastore it lives in. The first bullmq adapter is
// only a fallback for a root whose queue is not registered on the board.
export async function getFlowTree(
  queues: BullBoardQueues,
  boardQueueName: string,
  jobId: string,
  window: FlowWindow
): Promise<JobNode | null> {
  const adapter = findBoardAdapter(queues, boardQueueName);
  const producer = await (adapter ?? findBullMQAdapter(queues))?.getFlowProducer();
  if (!producer) return null;

  return await producer
    .getFlow({
      queueName: adapter?.getQueueName() ?? boardQueueName,
      id: jobId,
      depth: window.depth,
      maxChildren: window.maxChildren,
    })
    .catch(() => null);
}

/**
 * Traverses the parent chain of a job across queues to find the flow root.
 * Returns the board queue name and job ID of the root, or null if
 * no flow root can be determined.
 */
export async function findFlowRoot(
  queues: BullBoardQueues,
  job: Job
): Promise<{ queueName: string; jobId: string } | null> {
  const lookup = buildQueueLookup(queues);
  let currJob = job;
  let currAdapter = lookup.get(job.queueQualifiedName);

  while (currJob) {
    const parent = currJob.opts?.parent;
    if (!parent?.id || !parent?.queue) {
      if (!currJob.id) {
        return null;
      }
      return { queueName: currAdapter?.getName() ?? currJob.queueName, jobId: currJob.id };
    }

    const parentAdapter = lookup.get(parent.queue);
    if (!parentAdapter) {
      return null;
    }

    const parentJob = await parentAdapter.getJob(parent.id);
    if (!parentJob) {
      return null;
    }

    currJob = parentJob as Job;
    currAdapter = parentAdapter;
  }

  return null;
}
