import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import type { DiscoveredQueue } from '../src/discovery';
import { QueueRegistry } from '../src/registry';

function fakeAdapter(name: string): BaseAdapter {
  return { getName: () => name } as unknown as BaseAdapter;
}

function setup() {
  const added: string[] = [];
  const removed: string[] = [];
  const closed: string[] = [];

  const registry = new QueueRegistry({
    board: {
      addQueue: (adapter) => added.push(adapter.getName()),
      removeQueue: (adapter) =>
        removed.push(typeof adapter === 'string' ? adapter : adapter.getName()),
    },
    createQueue: (queue: DiscoveredQueue) => ({
      adapter: fakeAdapter(queue.name),
      close: async () => {
        closed.push(queue.name);
      },
    }),
    onWarning: () => undefined,
  });

  return { registry, added, removed, closed };
}

const mq = (name: string, prefix = 'bull'): DiscoveredQueue => ({ prefix, name, lib: 'bullmq' });

describe('QueueRegistry', () => {
  it('adds every newly discovered queue', async () => {
    const { registry, added } = setup();

    await registry.sync([mq('a'), mq('b')]);

    expect(added).toEqual(['a', 'b']);
  });

  it('does not re-add a queue that is already registered', async () => {
    const { registry, added } = setup();

    await registry.sync([mq('a')]);
    await registry.sync([mq('a')]);

    expect(added).toEqual(['a']);
  });

  it('removes and closes a queue that has disappeared', async () => {
    const { registry, removed, closed } = setup();

    await registry.sync([mq('a'), mq('b')]);
    await registry.sync([mq('a')]);

    expect(removed).toEqual(['b']);
    expect(closed).toEqual(['b']);
  });

  it('keeps the first prefix when two prefixes hold the same queue name', async () => {
    const warnings: string[] = [];
    const added: string[] = [];
    const registry = new QueueRegistry({
      board: { addQueue: (adapter) => added.push(adapter.getName()), removeQueue: () => undefined },
      createQueue: (queue) => ({
        adapter: fakeAdapter(queue.name),
        close: async () => undefined,
      }),
      onWarning: (message) => warnings.push(message),
    });

    await registry.sync([mq('shared', 'tenant-a'), mq('shared', 'tenant-b')]);

    expect(added).toEqual(['shared']);
    expect(warnings.join(' ')).toContain('tenant-b');
  });

  it('closes every queue on shutdown', async () => {
    const { registry, closed } = setup();

    await registry.sync([mq('a'), mq('b')]);
    await registry.close();

    expect(closed.sort()).toEqual(['a', 'b']);
  });

  it('skips a queue it cannot construct and keeps the others', async () => {
    const warnings: string[] = [];
    const added: string[] = [];
    const registry = new QueueRegistry({
      board: { addQueue: (adapter) => added.push(adapter.getName()), removeQueue: () => undefined },
      createQueue: (queue) => {
        if (queue.name === 'bad:name') throw new Error('Queue name cannot contain :');

        return { adapter: fakeAdapter(queue.name), close: async () => undefined };
      },
      onWarning: (message) => warnings.push(message),
    });

    await registry.sync([mq('bad:name'), mq('good')]);

    expect(added).toEqual(['good']);
    expect(warnings.join(' ')).toContain('bad:name');
  });
});
