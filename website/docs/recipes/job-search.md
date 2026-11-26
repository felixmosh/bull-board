# Job search

A queue can be searched by job fields when its adapter is given a search provider. The provider answers the question "which job ids have this value in this field", and the board does the rest: it loads those jobs, checks their current state, and shows them with the usual job cards and actions. A queue without a provider shows no search box and behaves exactly as before.

bull-board does not index or scan anything itself. Finding jobs by a value in their data needs an index that is written when jobs are added, and that index lives wherever you choose to keep it: your own database, a search service, or a Redis structure you maintain next to the queue.

## The provider

```ts
import type { JobSearchProvider } from '@bull-board/api/typings/app';

interface JobSearchProvider {
  fields(): Promise<string[]>;
  search(query: {
    field: string;
    value: string;
    status?: JobStatus;
    cursor?: string;
    limit: number;
  }): Promise<{ jobIds: string[]; cursor?: string }>;
}
```

`fields()` lists the field names the queue can be searched by. They are shown in the UI as written, so use names a person reading the dashboard will recognise, such as `data.tenantId` or `name`. The board rejects a search on any field not in this list with a 400 and `ERRORS.SEARCH_FIELD_NOT_INDEXED`, without calling `search`.

`search()` returns up to `limit` job ids whose `field` equals `value`, newest first, plus an opaque `cursor` when there are more. The board passes that cursor back unchanged to fetch the next page, and stops offering more results when it is absent.

`status` is set when the user has a status tab other than **Latest** selected. A provider can use it to narrow its query, but it doesn't have to: the board reads each job's current state and drops any job that isn't in the requested status. The same applies to ids whose job no longer exists, for example because `removeOnComplete` deleted it, so a provider never has to clean up its index synchronously. Both cases can make a page shorter than `limit`.

## Example

This provider answers from an `orders` table the application already keeps, which stores the BullMQ job id of each order's processing job.

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { JobSearchProvider } from '@bull-board/api/typings/app';

const ordersSearch: JobSearchProvider = {
  fields: async () => ['data.tenantId', 'data.orderId'],
  search: async ({ field, value, cursor, limit }) => {
    const column = field === 'data.tenantId' ? 'tenant_id' : 'order_id';
    const rows = await db.query(
      `SELECT id, job_id FROM orders
       WHERE ${column} = $1 AND ($2::bigint IS NULL OR id < $2)
       ORDER BY id DESC
       LIMIT $3`,
      [value, cursor ?? null, limit + 1]
    );
    const page = rows.slice(0, limit);

    return {
      jobIds: page.map((row) => row.job_id),
      cursor: rows.length > limit ? String(page[page.length - 1].id) : undefined,
    };
  },
};

createBullBoard({
  queues: [new BullMQAdapter(ordersQueue, { search: ordersSearch })],
  serverAdapter,
});
```

`search` is an option on every queue adapter, so each queue gets its own provider, or none.

## Diagnostics

A provider can also describe the state of its index, which lets the dashboard show whether the index is healthy and how a given job is indexed. The `diagnostics` property is optional, and so are two of its three methods.

```ts
interface JobSearchProvider {
  fields(): Promise<string[]>;
  search(query: JobSearchQuery): Promise<JobSearchResult>;
  diagnostics?: JobSearchDiagnostics;
}

interface JobSearchDiagnostics {
  status(): Promise<JobSearchStatus>;
  inspect?(jobId: string): Promise<JobSearchInspection>;
  checkCoverage?(options: { sample: number }): Promise<JobSearchCoverage>;
}

interface JobSearchStatus {
  health: 'ok' | 'degraded' | 'down';
  reasons: JobSearchHealthReason[];
  indexedJobs?: number;
  indexerLastSeenAt?: number;
  lastEventAt?: number;
  pendingRetries?: number;
  lastBackfill?: { finishedAt: number; jobs: number; durationMs: number };
  lastSweep?: { finishedAt: number; checked: number; removed: number };
}

type JobSearchHealthReason =
  | 'INDEXER_NOT_SEEN'
  | 'INDEXER_NEVER_STARTED'
  | 'PENDING_RETRIES'
  | 'BACKFILL_RUNNING';

interface JobSearchInspection {
  fields: { field: string; values: string[]; indexed: boolean }[];
}

interface JobSearchCoverage {
  checked: number;
  missing: string[];
}
```

`status()` is the only required method. It returns the provider's own judgement of its index as `health`, plus the `reasons` behind it. Every other field of the result is optional, so a provider backed by an application's own table can report just the numbers it has. The timestamps are milliseconds since the epoch. `indexedJobs` is the number of job ids the index holds, which the dashboard shows next to the queue's job total. It is a hint rather than a proof, because an index can still hold ids of jobs that have since been removed.

`health` is `ok` when the index is current, `degraded` when it works but is behind or being rebuilt, and `down` when nothing is keeping it up to date. The reasons are a closed list so that the dashboard can translate them:

| Reason | Meaning |
| --- | --- |
| `INDEXER_NOT_SEEN` | The process that writes the index has not reported in recently. |
| `INDEXER_NEVER_STARTED` | The index has never been written to by an indexer. |
| `PENDING_RETRIES` | Some jobs could not be indexed yet and are waiting to be retried. |
| `BACKFILL_RUNNING` | Jobs that existed before the indexer started are still being indexed. |

`inspect(jobId)` returns, for one job, each searchable field with the values extracted from that job and whether the job is present in the index under those values. `checkCoverage({ sample })` looks at the newest `sample` jobs of the queue and returns how many it `checked` and the ids of those that are `missing` from the index. The `sample` is between 1 and 1000, and the board passes 200 when you open the check from the dashboard.

A provider that reads from your own table can leave `inspect` and `checkCoverage` out and implement only `status()`. The dashboard then offers only what the provider supports.

### Routes

The diagnostics add three routes next to the search routes, described in the [HTTP API reference](/reference/http-api):

| Route | Returns |
| --- | --- |
| `GET /api/queues/:queueName/search/status` | The result of `status()`. |
| `GET /api/queues/:queueName/search/coverage?sample=` | The result of `checkCoverage()`. `sample` is 1 to 1000 and defaults to 200; a value outside that range answers 400 with `ERRORS.INVALID_QUERY_PARAM`. |
| `GET /api/queues/:queueName/search/jobs/:jobId` | The result of `inspect()` for that job. |

Each route answers 404 with `ERRORS.SEARCH_NOT_CONFIGURED` when the queue has no provider, and 404 with `ERRORS.SEARCH_DIAGNOSTICS_NOT_SUPPORTED` when the provider has no `diagnostics`, or has no `inspect` or `checkCoverage` for the route that needs it. The response of `GET /api/queues/:queueName/search/fields` also carries `diagnostics: { status, inspect, coverage }`, three booleans saying which of these the provider implements, so the dashboard knows what to show without calling the routes. The visibility guard and access control hooks apply to these routes as they do to every queue route, and they work on read-only queues.

### In the dashboard

When the provider has `diagnostics`, the search row on the queue page ends with a pill showing the index health as a coloured dot and one word: **Indexed** for `ok`, **Degraded** for `degraded` and **Offline** for `down`. The pill sits in a fixed slot at the right end of the row, so the row does not move when the status loads. The status is fetched every 15 seconds while the queue page is open. The pill is absent until the first status response arrives, and it is not shown on a queue that has no provider or whose provider lists no fields.

Clicking the pill opens a **Search index** modal. It lists the searchable fields, the health with a sentence for each reason, when the indexer was last seen, when the last event was handled, the indexed jobs next to the queue's job total, the pending retries, the last backfill and the last sweep. A row is shown only when the provider reported the value. When the provider has `checkCoverage`, the modal also has a **Check coverage** button. It runs the check and shows how many recent jobs were checked and how many are missing, with each missing id linking to its job page.

When the provider has `inspect`, the job page gains a **Search index** section below the job card. It has one row per searchable field with the values found in that job and whether the job is indexed under them. A field the job has no value for reads "No value". The section is hidden when the provider has no `inspect` or the inspection request fails.

## In the dashboard

A queue with a provider shows a search box directly under its status tabs, in the bar that stays at the top while you scroll. The field to search is on the left of the box: a selector when the provider lists several fields, a label when it lists one. Press <kbd>/</kbd> anywhere on the page to focus the box, type a value and press <kbd>Enter</kbd>.

The matching jobs then replace the paginated job list. A **Matches** count sits next to the box, with a `+` while the provider has more results, and a **Load more** button below the list fetches the next page. On the **Latest** tab each result carries a pill with its current state, because the results mix states. On any other tab the results are narrowed to that state, and the tab is named next to the count.

The status tabs hide their job counts while a search is active, because those counts cover the whole queue rather than the search. The **Retry all**, **Clean all** and **Promote all** buttons and the pagination are hidden for the same reason. Actions on individual job cards work as usual.

The search is kept in the URL as `field` and `q`, for example `/queue/orders?status=failed&field=data.tenantId&q=acme`, so it can be linked to and survives a reload. Switching status tabs keeps it, and opening a job and going back returns to the same results. The × in the box or <kbd>Esc</kbd> clears the search and returns to the plain job list.

Search works on read-only queues, and the [visibility guard](/recipes/visibility-guard) and [access control hooks](/recipes/access-control-hooks) apply to the search routes the same way they apply to every other queue route.

## HTTP API

The two routes are listed in the [HTTP API reference](/reference/http-api): `GET /api/queues/:queueName/search/fields` and `GET /api/queues/:queueName/search?field=&value=&status=&cursor=&limit=`. On a queue without a provider both answer 404 with `ERRORS.SEARCH_NOT_CONFIGURED`.

Both routes sit under `/api/queues/:queueName/`, next to the job routes, so a job whose id is literally `search` can't be read through `GET /api/queues/:queueName/search`. The same already applies to job ids such as `metrics` and `workers`.
