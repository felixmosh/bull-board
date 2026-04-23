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

![Job detail with Logs tab, showing timestamped worker output](/screenshots/job-logs.png)

Live example: <a href="/bull-board/demo/" target="_blank" rel="noopener">open the demo ↗</a> and drill into a worker-processed job in `emails:welcome`.

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

Live example: <a href="/bull-board/demo/" target="_blank" rel="noopener">open the demo ↗</a> and scroll to `reports:nightly` for a parent job with children.

Caveat: `job.log()` is BullMQ-only. Bull has no equivalent.
