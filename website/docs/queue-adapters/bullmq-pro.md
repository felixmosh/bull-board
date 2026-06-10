# BullMQ Pro

For the [BullMQ Pro](https://docs.bullmq.io/bullmq-pro/introduction) queue library. Import `BullMQProAdapter` instead of `BullMQAdapter` to get awareness of Pro groups: group counts are folded into the `waiting`/`delayed`/`paused` job counts, jobs from `waiting`/`limited`/`maxed`/`paused` groups are listed alongside regular jobs in those tabs, and the group id is shown next to the job name in the UI.

## Install

```sh
npm install @bull-board/api @bull-board/express
```

## Usage

```js
const { QueuePro } = require('@taskforcesh/bullmq-pro');
const { createBullBoard } = require('@bull-board/api');
const { BullMQProAdapter } = require('@bull-board/api/bullMQProAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const queuePro = new QueuePro('queueProName');
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQProAdapter(queuePro)],
  serverAdapter,
});
```

All `BullMQAdapter` options (`readOnlyMode`, `allowRetries`, `description`, `prefix`, `setFormatter`, `setVisibilityGuard`) work the same way on `BullMQProAdapter`.
