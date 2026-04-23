# Read-only mode

> Applies to: all adapters.

Read-only mode disables every destructive action on a queue. No retries, no removals, no queue operations (pause, resume, empty, clean, obliterate), no adding jobs. Use it to share the dashboard with stakeholders, support, or shared dev environments without risking anything.

## Enable per queue

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue, { readOnlyMode: true }),
  ],
  serverAdapter,
});
```

The flag is per queue adapter, so one board can mix read-only and writable queues.

## What gets disabled

With `readOnlyMode: true`, the API endpoint for any write action on that queue returns **HTTP 405 Method Not Allowed**, and the matching buttons are hidden in the UI.

| Action | Disabled in read-only mode |
| --- | --- |
| Add job | Yes |
| Retry job (single) | Yes |
| Retry all | Yes |
| Promote job (single) | Yes |
| Promote all | Yes |
| Remove job (single) | Yes |
| Clean bulk (completed / failed / waiting) | Yes |
| Empty queue | Yes |
| Obliterate queue | Yes |
| Pause / resume queue | Yes |
| Set global concurrency | Yes |
| Update job data | Yes |
| View queue, job, logs, flow | No, still accessible |
| Pause-all / resume-all | Read-only queues are silently skipped, others proceed |

## Disabling retries only

`allowRetries` is independent. On a **writable** queue, `allowRetries: false` hides the retry buttons in the UI while leaving every other action in place:

```ts
new BullMQAdapter(emailQueue, { allowRetries: false });
```

Defaults to `true` on writable queues. When `readOnlyMode: true`, `allowRetries` is forced to `false`, the option is ignored since retries are themselves a destructive action.

::: warning
`allowRetries: false` only hides the retry buttons — it doesn't block the retry API endpoint. Anyone who knows the URL can still trigger a retry. Use `readOnlyMode: true` for real enforcement.
:::

## Source of truth

See `QueueAdapterOptions` in [`packages/api/typings/app.d.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/typings/app.d.ts), the flag resolution in [`packages/api/src/queueAdapters/base.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/queueAdapters/base.ts), and the 405 enforcement in [`packages/api/src/providers/queue.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/providers/queue.ts).
