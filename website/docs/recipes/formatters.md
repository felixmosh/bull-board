# Formatters

> Applies to: all adapters.

Formatters rewrite how a job's fields render in the dashboard without touching producer or worker code. Useful when `data`, `returnValue`, `name`, or `progress` need a presentation layer: masking secrets, summarising big payloads, humanising enums, prefixing names in multi-tenant setups.

## Register a formatter

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

const adapter = new BullMQAdapter(emailQueue);

adapter.setFormatter('data', (data) => ({
  ...data,
  apiKey: data.apiKey ? '***' : undefined,
}));

createBullBoard({ queues: [adapter], serverAdapter });
```

`setFormatter` is per queue adapter. Each queue has its own set, only the fields you register are transformed.

## Available fields

| Field | Formatter receives | Must return | Notes |
| --- | --- | --- | --- |
| `'data'` | `job.data` | any JSON-serialisable value | Runs for every job. Good for redaction and summarisation. |
| `'returnValue'` | `job.returnvalue` | any JSON-serialisable value | Only meaningful on completed jobs. |
| `'name'` | the full `QueueJobJson` (`id`, `name`, `data`, `opts`, …) | `string` | Compose a display name from multiple fields. The raw job name stays at `jobProps.name`. |
| `'progress'` | `job.progress` (raw value) | any JSON-serialisable value | Typed as `string \| boolean \| number \| object`; return whatever the UI should render. |

## When formatters run

- On every job-list request and every job-detail request.
- Server-side, inside the API handler, before the response is sent.
- Not persisted. Your Redis data is untouched, only the response payload is rewritten.

## Performance

Formatters run once per job per request, the dashboard polls at a fixed interval, so the real cost is `cost per call × jobs per page × polls per minute`. Keep them cheap:

- No I/O, network, or DB lookups.
- Avoid large intermediate allocations, prefer in-place masking over deep clones.
- If the transform is expensive, cache the derived value on `data` at enqueue time instead.

## Source of truth

`setFormatter` and the `format` dispatch live on `BaseAdapter` in [`packages/api/src/queueAdapters/base.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/queueAdapters/base.ts) (lines 50–60). The `FormatterField` union is in [`packages/api/typings/app.d.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/typings/app.d.ts). Formatters are applied in [`packages/api/src/handlers/queues.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/handlers/queues.ts) (`formatJob`).
