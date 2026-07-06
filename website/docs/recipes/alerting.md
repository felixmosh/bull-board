# Alerting on failed jobs

> Applies to: all adapters.

bull-board is a viewer, not a monitor. It shows the state of your queues while you have the tab open. It doesn't watch them for you and it sends nothing anywhere, so "how do I get alerted when a job fails?" isn't a question the dashboard answers. That part is on you, and it belongs in your worker code, not the board.

BullMQ already emits the events you need. Wire your alerting to those, and use bull-board to investigate once an alert fires.

## Alert from the worker (same process)

If the alert lives in the same process as the worker, listen to its `failed` event. In most cases you only want to page once a job has spent all its retries, not on every intermediate attempt:

```ts
import { Worker } from 'bullmq';

const worker = new Worker('emails', processor, { connection });

worker.on('failed', (job, err) => {
  // `failed` fires on every attempt. Only alert once retries are exhausted.
  const exhausted = !job || job.attemptsMade >= (job.opts.attempts ?? 1);
  if (exhausted) {
    notifyOnCall(`Job ${job?.id} on "emails" failed for good: ${err.message}`);
  }
});
```

Attach an `error` listener too. Without one, an error inside the worker can bubble up as an unhandled exception and take the process down:

```ts
worker.on('error', (err) => {
  logger.error({ err }, 'bullmq worker error');
});
```

## Alert from anywhere (cross-process)

Worker events only fire in the process running the worker. If your alerting service runs in a separate process (an API pod, a small dedicated watcher), use `QueueEvents`, which reads the events straight from Redis:

```ts
import { QueueEvents } from 'bullmq';

const events = new QueueEvents('emails', { connection });

events.on('failed', ({ jobId, failedReason }) => {
  notifyOnCall(`Job ${jobId} on "emails" failed: ${failedReason}`);
});

events.on('stalled', ({ jobId }) => {
  // A worker picked the job up and then went silent (crash, OOM, event-loop block).
  notifyOnCall(`Job ${jobId} on "emails" stalled`);
});
```

`QueueEvents` gives you `jobId` and `failedReason`, but not the `Job` instance, so the "retries exhausted?" check from the worker version isn't available here. If you only want the final failure, either keep that logic in the worker, or fetch the job (`queue.getJob(jobId)`) and inspect `attemptsMade` yourself.

## Route permanently-failed jobs to a dead-letter queue

A common pattern: once a job is truly dead, push it onto a separate "dead-letter" queue, then register that queue on the board. Now permanently-failed work has its own inbox you can inspect and replay from the dashboard, instead of hunting through the failed tab of a busy queue.

```ts
const deadLetters = new Queue('emails-dead-letter', { connection });

worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await deadLetters.add('dead', { original: job.data, reason: err.message });
  }
});

// Register both on the board so the DLQ is one click away.
createBullBoard({
  queues: [new BullMQAdapter(emailsQueue), new BullMQAdapter(deadLetters)],
  serverAdapter,
});
```

Mark the dead-letter queue [read-only](/recipes/read-only-mode) if it's only there to be read.

## What the dashboard does give you

Not alerts, but two things worth knowing:

- **Throughput chart.** Set `showMetrics: true` in [UIConfig](/configuration/ui-config) for a completed/failed-per-minute chart per queue. It needs [BullMQ metrics](https://docs.bullmq.io/guide/metrics) enabled on your workers. Good for spotting a spike after the fact, not for waking anyone up.
- **Job logs.** Lines your worker writes with `job.log()` show up under each job. When an alert points you at a failed job, that's where the "what happened" usually is. See [Job logs and flows](/recipes/job-logs-and-flows).

## Going deeper

Alerting well (deduping, escalation, telling a stalled worker apart from a genuinely failing job) is a BullMQ and ops concern, not a bull-board one. The BullMQ docs are the source for the event semantics:

- [Events](https://docs.bullmq.io/guide/events): the full `QueueEvents` list.
- [Workers](https://docs.bullmq.io/guide/workers): worker-level listeners and the `error` event.
- [Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs): attempts, backoff, and what "failed for good" means.
