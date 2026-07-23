import type { AppQueue, Status } from '@bull-board/api/typings/app';
import { AppQueueTreeNode } from './toTree';

const STATUS_ORDER: Status[] = [
  'active',
  'waiting',
  'waiting-children',
  'prioritized',
  'delayed',
  'completed',
  'failed',
  'paused',
];

export function countQueues(node: AppQueueTreeNode): number {
  if (!node.children.length) return node.queue ? 1 : 0;
  return node.children.reduce((sum, child) => sum + countQueues(child), 0);
}

export function countPausedQueues(node: AppQueueTreeNode): number {
  if (!node.children.length) return node.queue?.isPaused ? 1 : 0;
  return node.children.reduce((sum, child) => sum + countPausedQueues(child), 0);
}

function forEachLeafQueue(node: AppQueueTreeNode, fn: (queue: AppQueue) => void): void {
  if (!node.children.length) {
    if (node.queue) fn(node.queue);
    return;
  }
  node.children.forEach((child) => forEachLeafQueue(child, fn));
}

export interface AggregatedCounts {
  total: number;
  byStatus: Partial<Record<Status, number>>;
  statuses: Status[];
}

export function aggregateCounts(node: AppQueueTreeNode): AggregatedCounts {
  const byStatus: Partial<Record<Status, number>> = {};

  forEachLeafQueue(node, (queue) => {
    queue.statuses.forEach((status) => {
      const value = queue.counts[status] || 0;
      if (value > 0) byStatus[status] = (byStatus[status] || 0) + value;
    });
  });

  const statuses = STATUS_ORDER.filter((status) => (byStatus[status] || 0) > 0);
  const total = statuses.reduce((sum, status) => sum + (byStatus[status] || 0), 0);

  return { total, byStatus, statuses };
}

export function collectQueues(node: AppQueueTreeNode): AppQueue[] {
  const queues: AppQueue[] = [];
  forEachLeafQueue(node, (queue) => queues.push(queue));
  return queues;
}

export function collectQueueNames(
  node: AppQueueTreeNode,
  opts: { writableOnly?: boolean } = {}
): string[] {
  const names: string[] = [];
  forEachLeafQueue(node, (queue) => {
    if (opts.writableOnly && queue.readOnlyMode) return;
    names.push(queue.name);
  });
  return names;
}

export function areAllPaused(node: AppQueueTreeNode): boolean {
  let all = true;
  let any = false;
  forEachLeafQueue(node, (queue) => {
    any = true;
    if (!queue.isPaused) all = false;
  });
  return any && all;
}
