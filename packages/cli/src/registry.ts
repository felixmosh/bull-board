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
  createQueue(queue: DiscoveredQueue): QueueHandle;
  onWarning(message: string): void;
}

const keyOf = (queue: DiscoveredQueue) => `${queue.prefix}:${queue.name}`;

export class QueueRegistry {
  private readonly live = new Map<string, QueueHandle>();

  constructor(private readonly deps: QueueRegistryDeps) {}

  public async sync(discovered: DiscoveredQueue[]): Promise<void> {
    // The board keys its queue map by bare queue name (`packages/api/src/queuesApi.ts`),
    // so the same name under two prefixes would silently displace itself. First prefix wins.
    const claimedNames = new Set<string>();
    const wanted = new Map<string, DiscoveredQueue>();

    for (const queue of discovered) {
      if (claimedNames.has(queue.name)) {
        this.deps.onWarning(
          `Skipping "${queue.name}" under prefix "${queue.prefix}": that queue name is already ` +
            `served from another prefix.`
        );
        continue;
      }
      claimedNames.add(queue.name);
      wanted.set(keyOf(queue), queue);
    }

    for (const [key, queue] of wanted) {
      if (this.live.has(key)) continue;

      // A discovered queue is not always a constructible one. BullMQ refuses a name
      // containing a colon, for instance, though such keys exist in Redis from Bull and
      // from other producers. One unusable queue must not take the dashboard down with it.
      let handle: QueueHandle;
      try {
        handle = this.deps.createQueue(queue);
      } catch (error) {
        this.deps.onWarning(
          `Skipping "${queue.name}" under prefix "${queue.prefix}": ${(error as Error).message}`
        );
        continue;
      }

      this.live.set(key, handle);
      this.deps.board.addQueue(handle.adapter);
    }

    // Map iteration tolerates deleting the current entry mid-loop, so this copy is not
    // required for correctness, but it is cheap insurance against a future change to this
    // loop body (an early `continue` before the delete, an added await before it, etc.)
    // silently becoming unsafe.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const [key, handle] of [...this.live]) {
      if (wanted.has(key)) continue;
      this.deps.board.removeQueue(handle.adapter);
      this.live.delete(key);
      // A queue that refuses to close is already off the board and out of the map, so the
      // only thing left to do is say so. Rethrowing would abandon the remaining removals.
      await handle.close().catch((error: Error) => {
        this.deps.onWarning(`Failed to close "${handle.adapter.getName()}": ${error.message}`);
      });
    }
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
