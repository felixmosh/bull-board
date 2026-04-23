# Global concurrency

BullMQ supports a global cap on concurrent jobs across all workers for a queue. The dashboard exposes it as a text input on the queue detail page.

## Set from the UI

Open the queue's settings dropdown, pick "Global concurrency", enter a number.

Bull-board calls `Queue.setGlobalConcurrency(n)` on your behalf. Workers respect the new cap on their next job pickup.

## Set in code

```ts
await queue.setGlobalConcurrency(5);
```

The value is stored in Redis so any worker across any process sees it.

Bull-only queues: global concurrency isn't supported. The UI hides the control.

## Read-only mode

Read-only mode disables the control. If you want stakeholders to see the number but not change it, `readOnlyMode: true` is the switch.
