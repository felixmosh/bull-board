# Job logs and flows

Two features people often miss.

## Job logs

In a BullMQ worker, call `job.log()` to push lines that appear in the dashboard's job detail view:

```ts
import { Worker } from 'bullmq';

new Worker('emails', async (job) => {
  await job.log(`Sending to ${job.data.to}`);
  await sendEmail(job.data);
  await job.log('Sent.');
}, { connection });
```

Open the job in the dashboard, switch to the Logs tab.

`job.log()` is BullMQ-only. Bull has no equivalent.

![Job detail with Logs tab, showing timestamped worker output](/screenshots/job-logs.png)

Live example: <a href="/bull-board/demo/" target="_blank" rel="noopener">open the demo</a> and drill into a worker-processed job in `emails:welcome`.

## Job flows

BullMQ supports flows. Parent jobs that wait on child jobs across queues. Build one with `FlowProducer`:

```ts
import { FlowProducer } from 'bullmq';

const flow = new FlowProducer({ connection });

await flow.add({
  name: 'build-report',
  queueName: 'reports',
  children: [
    { name: 'fetch-data', queueName: 'fetch' },
    { name: 'render-pdf', queueName: 'render' },
  ],
});
```

Bull-board renders the tree on the parent job's detail view. Click through to jump between parents and children.

![Parent job with Job Flow panel showing children across queues](/screenshots/flow-tree.png)

Live example: <a href="/bull-board/demo/" target="_blank" rel="noopener">open the demo</a> and scroll to `reports:nightly` for a parent job with children.

### When a parent is waiting on children that are not coming

A parent sits in `waiting-children` until its children finish, and the tree alone does not tell you whether that is going to happen. Each node with children carries the counts BullMQ keeps for it: how many are done, how many are still pending, how many failed, and how many were ignored.

![A flow parent showing one pending and one ignored child](/screenshots/flow-ignored-children.png)

Ignored is the one worth knowing about. A child added with `ignoreDependencyOnFailure` that fails does not fail its parent, it is set aside and the parent carries on as if it had succeeded:

```ts
await flow.add({
  name: 'build-report',
  queueName: 'reports',
  children: [
    { name: 'fetch-optional', queueName: 'fetch', opts: { ignoreDependencyOnFailure: true } },
  ],
});
```

That is the point of the option, and it also means a report can complete having quietly skipped half its inputs. Hovering the ignored count shows why each of those children failed, read from `Job#getIgnoredChildrenFailures()`.

Failed and ignored take the failed and delayed colours; processed and pending stay muted, since a parent working through its children normally is not news. A leaf, having no children, shows nothing.
