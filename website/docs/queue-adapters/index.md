# Queue Adapters

Queue adapters wrap your Bull or BullMQ queue instances so the board can read and manipulate them. The core `@bull-board/api` ships with three built-in adapters; third-party queue systems can add their own.

## Built-in adapters

| Queue system | Adapter | Docs |
|-------------|---------|------|
| Bull | `BullAdapter` | [Bull →](/queue-adapters/bull) |
| BullMQ | `BullMQAdapter` | [BullMQ →](/queue-adapters/bullmq) |
| BullMQ Pro | `BullMQProAdapter` | [BullMQ Pro →](/queue-adapters/bullmq-pro) |

`BullMQProAdapter` extends `BullMQAdapter` to handle [Pro groups](https://docs.bullmq.io/bullmq-pro/introduction). All `BullMQAdapter` options work the same way on it.

## Shared options

All adapters accept the same optional options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `readOnlyMode` | `boolean` | `false` | Hides all queue and job actions. |
| `allowRetries` | `boolean` | `true` | Shows or hides the retry buttons. Ignored when `readOnlyMode` is `true`. |
| `description` | `string` | `''` | Queue description text displayed in the UI. |
| `displayName` | `string` | `''` | Overrides the queue name shown in the UI. |
| `prefix` | `string` | `''` | Prepended to job names in the UI. |
| `delimiter` | `string` | `''` | Delimiter between the prefix and the job name. |

## Instance methods

All adapters expose `setFormatter` and `setVisibilityGuard`:

```ts
adapter.setFormatter('name', (job) => `#${job.name}`);
adapter.setFormatter('data', (data) => redact(data));
adapter.setFormatter('returnValue', (value) => redact(value));
adapter.setFormatter('progress', (progress) => `${Math.round(progress)}%`);

adapter.setVisibilityGuard((request) => {
  // return true to show this queue, false to hide it
  return request.headers['x-tenant-id'] === 'acme';
});
```

## Mixing adapters

You can mix Bull and BullMQ queues in the same board:

```ts
createBullBoard({
  queues: [
    new BullAdapter(bullQueue),
    new BullMQAdapter(bullmqQueue),
    new BullMQProAdapter(bullmqProQueue),
  ],
  serverAdapter,
});
```
