# @bull-board/bun

Bun adapter for Bull-Board

## Installation

```sh
bun add @bull-board/bun
```

## Usage

```typescript
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BunAdapter } from '@bull-board/bun';
import { Queue } from 'bullmq';

const someQueue = new Queue('someQueueName');

const serverAdapter = new BunAdapter();

createBullBoard({
  queues: [new BullMQAdapter(someQueue)],
  serverAdapter,
});

serverAdapter.setBasePath('/ui');

const server = Bun.serve({
  port: 3000,
  fetch: serverAdapter.registerPlugin(),
});

console.log(`Server is running on http://localhost:${server.port}/ui`);
```

For more detailed examples, check out the [example project](../../examples/with-bun).
