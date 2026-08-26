import { collectGroupPaths, toTree } from '../../src/utils/toTree';
import { makeQueue } from '../testUtils';

describe('toTree', () => {
  it('hangs a queue without a delimiter straight off the root', () => {
    const root = toTree([makeQueue('flat', { delimiter: undefined })]);

    expect(root.children).toHaveLength(1);
    expect(root.children[0].name).toBe('flat');
    expect(root.children[0].queue?.name).toBe('flat');
    expect(root.children[0].children).toEqual([]);
  });

  it('splits a delimited name into nested nodes, carrying the queue on the leaf only', () => {
    const root = toTree([makeQueue('billing.invoices.retry')]);

    const [billing] = root.children;
    expect(billing.name).toBe('billing');
    expect(billing.queue).toBeUndefined();

    const [invoices] = billing.children;
    expect(invoices.name).toBe('invoices');
    expect(invoices.queue).toBeUndefined();

    const [retry] = invoices.children;
    expect(retry.name).toBe('retry');
    expect(retry.queue?.name).toBe('billing.invoices.retry');
  });

  it('merges queues that share a prefix into one branch', () => {
    const root = toTree([makeQueue('billing.invoices'), makeQueue('billing.refunds')]);

    expect(root.children).toHaveLength(1);
    expect(root.children[0].children.map((node) => node.name)).toEqual(['invoices', 'refunds']);
  });

  it('splits inside a redis cluster hash tag rather than treating the braces as a name', () => {
    const root = toTree([makeQueue('{billing.invoices}')]);

    expect(root.children[0].name).toBe('billing');
    expect(root.children[0].children[0].name).toBe('invoices');
    expect(root.children[0].children[0].queue?.name).toBe('{billing.invoices}');
  });

  it('sorts groups before leaves and alphabetically within each, only when asked', () => {
    const queues = [
      makeQueue('zeta', { delimiter: undefined }),
      makeQueue('beta.one'),
      makeQueue('alpha', { delimiter: undefined }),
    ];

    expect(toTree(queues).children.map((node) => node.name)).toEqual(['zeta', 'beta', 'alpha']);
    expect(toTree(queues, true).children.map((node) => node.name)).toEqual([
      'beta',
      'alpha',
      'zeta',
    ]);
  });
});

describe('collectGroupPaths', () => {
  it('returns every group path and no leaf', () => {
    const root = toTree([
      makeQueue('billing.invoices.retry'),
      makeQueue('billing.refunds'),
      makeQueue('standalone', { delimiter: undefined }),
    ]);

    expect(collectGroupPaths(root)).toEqual(['billing', 'billing/invoices']);
  });

  it('returns nothing for a flat tree', () => {
    expect(collectGroupPaths(toTree([makeQueue('flat', { delimiter: undefined })]))).toEqual([]);
  });
});
