# Add and remove queues at runtime

> Applies to: all adapters.

`createBullBoard` isn't a one-shot call. It also returns four functions that change which queues the board shows while it's running, with no rebuild or restart:

```ts
const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});
```

Use them when queues aren't all known at startup: per-tenant queues created on demand, queues discovered from a registry, or a dashboard that follows queues as workers spin them up and down.

## The four functions

| Function | Signature | Effect |
| --- | --- | --- |
| `addQueue` | `(queue: BaseAdapter) => void` | Adds one queue. Overwrites if a queue with the same name is already registered. |
| `removeQueue` | `(queueOrName: string \| BaseAdapter) => void` | Removes one queue, by adapter or by name. No-op if it isn't registered. |
| `setQueues` | `(queues: BaseAdapter[]) => void` | Adds or overwrites a batch, and **leaves other registered queues in place**. |
| `replaceQueues` | `(queues: BaseAdapter[]) => void` | Same as `setQueues`, but also **removes any queue not in the list**. A full sync. |

Queues are keyed by name (`queue.getName()`, which includes any `prefix` you set). Registering two adapters that resolve to the same name means the second wins.

## Add a queue on demand

```ts
const board = createBullBoard({ queues: [], serverAdapter });

function onTenantCreated(tenantId: string) {
  const queue = new Queue(`emails-${tenantId}`, { connection });
  board.addQueue(new BullMQAdapter(queue));
}

function onTenantDeleted(tenantId: string) {
  board.removeQueue(`emails-${tenantId}`);
}
```

The dashboard picks up the change on its next poll, with no reload or remount.

## Sync the board to a known set

`setQueues` vs `replaceQueues` differ only in what happens to queues you _don't_ pass:

```ts
// Board currently shows: A, B, C

board.setQueues([b, d]);      // → A, B, C, D  (adds D, updates B, keeps A and C)
board.replaceQueues([b, d]);  // → B, D        (drops A and C)
```

Reach for `replaceQueues` when you have the authoritative full list and want the board to mirror it exactly. Reach for `setQueues` when you're merging in a batch and don't want to disturb queues registered elsewhere.

## Notes

- Changes take effect on the next request. The functions write to the same `Map` the board reads each time, so there's no cache to bust.
- Removing a queue only detaches it from the dashboard. It doesn't close the Bull/BullMQ connection or touch Redis, so clean those up yourself if the queue is really gone.
- On [NestJS](/server-adapters/nestjs) you don't hold the return value of `createBullBoard` directly. The module already calls `addQueue` when you register feature queues, and it exposes the same board instance for manual changes via `@InjectBullBoard() board: BullBoardInstance`. See [`examples/with-nestjs-module`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-module).

## Source of truth

The four functions are built in [`packages/api/src/queuesApi.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/queuesApi.ts) and returned from `createBullBoard` in [`packages/api/src/index.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/index.ts).
