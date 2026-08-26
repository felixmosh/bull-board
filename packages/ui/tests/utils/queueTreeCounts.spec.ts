import {
  aggregateCounts,
  areAllPaused,
  collectQueueNames,
  collectQueues,
  countPausedQueues,
  countQueues,
} from '../../src/utils/queueTreeCounts';
import { toTree } from '../../src/utils/toTree';
import { makeQueue } from '../testUtils';

const withCounts = (
  name: string,
  counts: Partial<Record<string, number>>,
  overrides = {}
): ReturnType<typeof makeQueue> => {
  const queue = makeQueue(name, overrides);
  return { ...queue, counts: { ...queue.counts, ...counts } };
};

describe('countQueues', () => {
  it('counts the leaves of a nested tree, not the groups', () => {
    const root = toTree([
      makeQueue('billing.invoices'),
      makeQueue('billing.refunds'),
      makeQueue('shipping.labels'),
    ]);

    expect(countQueues(root)).toBe(3);
  });

  it('counts a single leaf node passed on its own', () => {
    const root = toTree([makeQueue('solo', { delimiter: undefined })]);

    expect(countQueues(root.children[0])).toBe(1);
  });

  it('is zero for an empty tree', () => {
    expect(countQueues(toTree([]))).toBe(0);
  });
});

describe('countPausedQueues', () => {
  it('counts only the paused leaves', () => {
    const root = toTree([
      makeQueue('billing.invoices', { isPaused: true }),
      makeQueue('billing.refunds'),
      makeQueue('shipping.labels', { isPaused: true }),
    ]);

    expect(countPausedQueues(root)).toBe(2);
  });
});

describe('aggregateCounts', () => {
  it('sums each status across every leaf', () => {
    const root = toTree([
      withCounts('billing.invoices', { waiting: 2, failed: 1 }),
      withCounts('billing.refunds', { waiting: 3, completed: 5 }),
    ]);

    expect(aggregateCounts(root).byStatus).toEqual({ waiting: 5, failed: 1, completed: 5 });
  });

  it('leaves out a status the queue does not advertise, even when a count is present', () => {
    const root = toTree([
      withCounts('billing.invoices', { waiting: 2, delayed: 9 }, { statuses: ['waiting'] }),
    ]);

    const { byStatus, statuses } = aggregateCounts(root);
    expect(byStatus).toEqual({ waiting: 2 });
    expect(statuses).toEqual(['waiting']);
  });

  it('drops a status whose total is zero', () => {
    const root = toTree([withCounts('billing.invoices', { waiting: 0, failed: 4 })]);

    expect(aggregateCounts(root).statuses).toEqual(['failed']);
  });

  it('orders statuses by pipeline position rather than by how the queues listed them', () => {
    const root = toTree([
      withCounts(
        'billing.invoices',
        { completed: 1, active: 1, delayed: 1, waiting: 1 },
        { statuses: ['completed', 'delayed', 'waiting', 'active'] }
      ),
    ]);

    expect(aggregateCounts(root).statuses).toEqual(['active', 'waiting', 'delayed', 'completed']);
  });

  it('totals only the statuses it kept', () => {
    const root = toTree([
      withCounts('billing.invoices', { waiting: 2, delayed: 9 }, { statuses: ['waiting'] }),
      withCounts('billing.refunds', { waiting: 3 }, { statuses: ['waiting'] }),
    ]);

    expect(aggregateCounts(root).total).toBe(5);
  });

  it('is empty for a tree with no queues', () => {
    expect(aggregateCounts(toTree([]))).toEqual({ total: 0, byStatus: {}, statuses: [] });
  });
});

describe('collectQueues', () => {
  it('flattens the leaves in tree order', () => {
    const root = toTree([
      makeQueue('billing.invoices'),
      makeQueue('billing.refunds'),
      makeQueue('shipping.labels'),
    ]);

    expect(collectQueues(root).map((queue) => queue.name)).toEqual([
      'billing.invoices',
      'billing.refunds',
      'shipping.labels',
    ]);
  });
});

describe('collectQueueNames', () => {
  const root = toTree([
    makeQueue('billing.invoices'),
    makeQueue('billing.archive', { readOnlyMode: true }),
    makeQueue('shipping.labels'),
  ]);

  it('returns every name by default', () => {
    expect(collectQueueNames(root)).toEqual([
      'billing.invoices',
      'billing.archive',
      'shipping.labels',
    ]);
  });

  it('leaves read only queues out of a bulk action target list', () => {
    expect(collectQueueNames(root, { writableOnly: true })).toEqual([
      'billing.invoices',
      'shipping.labels',
    ]);
  });
});

describe('areAllPaused', () => {
  it('is true only when every leaf is paused', () => {
    const allPaused = toTree([
      makeQueue('billing.invoices', { isPaused: true }),
      makeQueue('billing.refunds', { isPaused: true }),
    ]);

    expect(areAllPaused(allPaused)).toBe(true);
  });

  it('is false when one leaf is still running', () => {
    const mixed = toTree([
      makeQueue('billing.invoices', { isPaused: true }),
      makeQueue('billing.refunds'),
    ]);

    expect(areAllPaused(mixed)).toBe(false);
  });

  it('is false for a group holding no queues, rather than vacuously true', () => {
    expect(areAllPaused(toTree([]))).toBe(false);
  });
});
