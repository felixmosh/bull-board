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

## In the dashboard

A queue with a provider shows a search box directly under its status tabs, in the bar that stays at the top while you scroll. The field to search is on the left of the box: a selector when the provider lists several fields, a label when it lists one. Press <kbd>/</kbd> anywhere on the page to focus the box, type a value and press <kbd>Enter</kbd>.

The matching jobs then replace the paginated job list. A **Matches** count sits next to the box, with a `+` while the provider has more results, and a **Load more** button below the list fetches the next page. On the **Latest** tab each result carries a pill with its current state, because the results mix states. On any other tab the results are narrowed to that state, and the tab is named next to the count.

The status tabs hide their job counts while a search is active, because those counts cover the whole queue rather than the search. The **Retry all**, **Clean all** and **Promote all** buttons and the pagination are hidden for the same reason. Actions on individual job cards work as usual.

The search is kept in the URL as `field` and `q`, for example `/queue/orders?status=failed&field=data.tenantId&q=acme`, so it can be linked to and survives a reload. Switching status tabs keeps it, and opening a job and going back returns to the same results. The × in the box or <kbd>Esc</kbd> clears the search and returns to the plain job list.

Search works on read-only queues, and the [visibility guard](/recipes/visibility-guard) and [access control hooks](/recipes/access-control-hooks) apply to the search routes the same way they apply to every other queue route.

## HTTP API

The two routes are listed in the [HTTP API reference](/reference/http-api): `GET /api/queues/:queueName/search/fields` and `GET /api/queues/:queueName/search?field=&value=&status=&cursor=&limit=`. On a queue without a provider both answer 404 with `ERRORS.SEARCH_NOT_CONFIGURED`.

Both routes sit under `/api/queues/:queueName/`, next to the job routes, so a job whose id is literally `search` can't be read through `GET /api/queues/:queueName/search`. The same already applies to job ids such as `metrics` and `workers`.
