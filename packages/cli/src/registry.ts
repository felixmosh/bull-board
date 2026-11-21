import type { BaseAdapter } from '@bull-board/api/baseAdapter';
import type { DiscoveredQueue } from './discovery';

export interface QueueHandle {
  adapter: BaseAdapter;
  close(): Promise<void>;
}

export interface BoardApi {
  addQueue(adapter: BaseAdapter): void;
  removeQueue(adapter: BaseAdapter | string): void;
}

export interface QueueRegistryDeps {
  board: BoardApi;
  createQueue(queue: DiscoveredQueue): QueueHandle | null;
  onWarning(message: string): void;
  namespace?: string;
}

const keyOf = (queue: DiscoveredQueue) => `${queue.prefix}:${queue.name}`;

export class QueueRegistry {
  private readonly live = new Map<string, QueueHandle>();
  private readonly warned = new Set<string>();

  constructor(private readonly deps: QueueRegistryDeps) {}

  public adapters(): BaseAdapter[] {
    return [...this.live.values()].map((handle) => handle.adapter);
  }

  public async sync(discovered: DiscoveredQueue[]): Promise<void> {
    // The board keys queues by bare name, so the same name under two prefixes would displace
    // itself. First prefix wins.
    const claimedNames = new Set<string>();
    const wanted = new Map<string, DiscoveredQueue>();

    for (const queue of discovered) {
      if (claimedNames.has(queue.name)) {
        this.warnOnce(
          keyOf(queue),
          `Skipping "${queue.name}" under ${this.namespace} "${queue.prefix}": that queue name is ` +
            `already served from another ${this.namespace}.`
        );
        continue;
      }
      claimedNames.add(queue.name);
      wanted.set(keyOf(queue), queue);
    }

    for (const [key, queue] of wanted) {
      if (this.live.has(key)) continue;

      let handle: QueueHandle | null;
      try {
        handle = this.deps.createQueue(queue);
      } catch (error) {
        this.warnOnce(
          keyOf(queue),
          `Skipping "${queue.name}" under ${this.namespace} "${queue.prefix}": ${(error as Error).message}`
        );
        continue;
      }
      if (!handle) continue;

      this.live.set(key, handle);
      this.deps.board.addQueue(handle.adapter);
    }

    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const [key, handle] of [...this.live]) {
      if (wanted.has(key)) continue;
      this.deps.board.removeQueue(handle.adapter);
      this.live.delete(key);
      await handle.close().catch((error: Error) => {
        this.deps.onWarning(`Failed to close "${handle.adapter.getName()}": ${error.message}`);
      });
    }
  }

  private get namespace(): string {
    return this.deps.namespace ?? 'prefix';
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.deps.onWarning(message);
  }

  public async close(): Promise<void> {
    const handles = [...this.live.values()];
    this.live.clear();
    const results = await Promise.allSettled(handles.map((handle) => handle.close()));

    for (const result of results) {
      if (result.status === 'rejected') {
        this.deps.onWarning(`Failed to close a queue on shutdown: ${result.reason}`);
      }
    }
  }
}
