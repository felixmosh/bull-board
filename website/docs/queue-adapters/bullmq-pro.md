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

The jobs inside groups are counted from the per-group count that `getGroupsByStatus()` returns,
which `@taskforcesh/bullmq-pro` added in **7.46.3**. Groups that come back without one, which is every
group on an older version, are counted with `getGroupJobsCount()` instead, one call per such
group. Only a version that has neither falls back to counting a group as a single job.

Three things follow from how bullmq-pro reports groups:

- Counting grouped jobs means listing every group on every refresh: no call totals them. On a
  queue with a very large number of groups, that listing is the expensive part of a refresh.
- The board takes one reading of the queue, job counts and group listings together, and serves
  both the numbers and the page of jobs from it for up to five seconds. A page therefore always
  matches the counts its pagination was worked out from, at the cost of numbers that can be that
  stale. Anything done from the board (adding, pausing, cleaning, ...) drops the reading at once.
- Jobs added to a group with a `priority` live in a separate sorted set that the count returned
  by `getGroupsByStatus()` does not include, so they are missing from the counts (and from the
  tail of the listing) even on 7.46.3.
