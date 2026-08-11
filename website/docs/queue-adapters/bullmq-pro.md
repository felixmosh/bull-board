# BullMQ Pro

For the [BullMQ Pro](https://docs.bullmq.io/bullmq-pro/introduction) queue library. Import `BullMQProAdapter` instead of `BullMQAdapter` to get awareness of Pro groups: the jobs held by `waiting`/`limited`/`maxed`/`paused` groups are folded into the `waiting`/`delayed`/`paused` job counts, those jobs are listed alongside regular jobs in the same tabs, and the group id is shown next to the job name in the UI.

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

## Group job counts

Counting the jobs inside groups needs the per-group count that `getGroupsByStatus()` returns,
which `@taskforcesh/bullmq-pro` added in **7.46.3**. On older versions the count is missing and
the board falls back to counting each group as a single job, which is what it reported before
7.46.3 was available.

Two further caveats come from bullmq-pro itself:

- Jobs added to a group with a `priority` live in a separate sorted set that the count returned
  by `getGroupsByStatus()` does not include, so they are missing from the counts (and from the
  tail of the listing) even on 7.46.3.
- Group listings are read once per queue refresh and reused for both the counts and the page of
  jobs, so a busy queue's numbers can be up to five seconds stale.
