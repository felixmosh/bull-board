# @bull-board/search-redis

Opt-in Redis-backed job search for [bull-board](https://github.com/felixmosh/bull-board).

It indexes the jobs of BullMQ queues into Redis and answers the `JobSearchProvider` that bull-board's search box calls. The core `@bull-board/api` stays stateless: nothing is indexed unless you create the pieces below. Search is an exact match on a field you chose, such as `data.tenantId`, with the newest jobs first.

## Install

```bash
npm install @bull-board/search-redis
```

`bullmq` (`^5.56.0 || ^6.0.0`) and `ioredis` (`^5.0.0 || ^6.0.0`) are peer dependencies, and `@bull-board/api` is a peer so the types match the board you run. Node 20 or newer.

## Searching many queues

`RedisSearch` is the recommended way to set this up. It holds one index and one indexer per queue, shares the connection, the prefix, the indexer options and the default fields between them, and hands back the provider for each queue.

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { RedisSearch } from '@bull-board/search-redis';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis({ maxRetriesPerRequest: null });
const ordersQueue = new Queue('orders', { connection });
const emailsQueue = new Queue('emails', { connection });

const search = new RedisSearch({
  connection,
  indexer: {
    onError: (error, { queue, jobIds }) => console.error(queue, jobIds, error),
  },
  fields: {
    'data.tenantId': 'data.tenantId',
    name: (job) => job.name,
  },
});

const ordersSearch = search.add(ordersQueue, {
  fields: { 'data.email': { path: 'data.email', normalize: (value) => value.toLowerCase() } },
});
const emailsSearch = search.add(emailsQueue);

await search.start();

createBullBoard({
  queues: [
    new BullMQAdapter(ordersQueue, { search: ordersSearch }),
    new BullMQAdapter(emailsQueue, { search: emailsSearch }),
  ],
  serverAdapter,
});
```

The `fields` of the constructor apply to every queue. The `fields` passed to `add` are merged over them, and a name in both is taken from the queue. Adding the same queue twice throws.

`add` only creates the index, the indexer and the provider. Nothing is written until `start()` runs, which starts the indexer of every added queue. A process that serves the board but does not index, because another process runs the indexer, calls `add` for its providers and never calls `start()`. The `indexer` option can be left out: each indexer then reads the event stream through the connection of its own queue. A queue added after `start()` has run starts indexing at once, and a failure of that start is passed to `onError` with the queue name and emitted as an `error` event on `search.indexer(queue)` when that indexer has a listener, so it is not lost when no `onError` is set.

If the indexer of one queue fails to start, `start()` stops the others and rethrows the error. `stop()` stops every indexer and does not close your connection or queues.

`onError` of the `indexer` option receives `{ queue, jobIds? }` as its second argument, where `queue` is the qualified name of the queue, so one handler can tell the queues apart. `RedisSearch` takes `connection`, `indexer` (optional), `fields` and `prefix`. The `indexer` options are those of `SearchIndexer` listed under Options.

The pieces of a single queue are available as `search.index(queue)` and `search.indexer(queue)`, for example to call `index.indexJob(job)` or to listen to indexer events. Both throw for a queue that was not added.

## Single queue pieces

`RedisSearch` is built from three classes that can be used on their own, for setups that need different options per queue, a different connection per queue, or an indexer running apart from the board.

### The three pieces

`RedisSearchIndex` is the store. It knows which fields are indexed, writes and removes entries, and answers ranged reads. `SearchIndexer` keeps one index in step with its queue by following BullMQ's event stream. `createRedisSearchProvider` adapts an index to the provider interface the board takes as the `search` option of a queue adapter.

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import {
  RedisSearchIndex,
  SearchIndexer,
  createRedisSearchProvider,
} from '@bull-board/search-redis';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis({ maxRetriesPerRequest: null });
const ordersQueue = new Queue('orders', { connection });

const index = new RedisSearchIndex({
  connection,
  queue: ordersQueue,
  fields: {
    'data.tenantId': 'data.tenantId',
    'data.email': { path: 'data.email', normalize: (value) => value.toLowerCase() },
    name: (job) => job.name,
  },
});

const indexer = new SearchIndexer(index);
await indexer.start();

createBullBoard({
  queues: [new BullMQAdapter(ordersQueue, { search: createRedisSearchProvider(index) })],
  serverAdapter,
});
```

The indexer finds jobs from every producer, including other services, flows, job schedulers and retries, because it reads the queue's event stream and not the calls your own code makes. Your code does not need to add jobs through this package.

When your app's ioredis and the copy bullmq ships with differ in type, pass connection options instead of an instance to `Queue` and `SearchIndexer`. The `connection` of `RedisSearchIndex` is always an ioredis `Redis` or `Cluster` instance.

### Fields

Each key of `fields` is the name shown in the board. Its value is one of:

- a string path into the job, written with dots and nothing else, such as `'data.tenantId'`, `'name'` or `'opts.priority'`;
- a function `(job) => unknown`;
- an object `{ path, normalize? }` or `{ extract, normalize? }`.

The result becomes zero or more index values. Strings are used as they are, finite numbers and booleans go through `String()`, arrays contribute each element under the same rules, and anything else (`null`, `undefined`, objects, non-finite numbers) produces no entry. `normalize` runs on each stored string and on the value being searched, so a lower-casing normalizer makes that field match without regard to case.

## Where to run the indexer

The indexer needs to run in a process that stays up. It can live in a worker process, in the app that serves the board, or in a process of its own. `RedisSearchIndex` and `createRedisSearchProvider` are what the board process needs, and the indexer can be elsewhere as long as it uses the same queue, the same `prefix` and the same fields. Two indexers on one queue produce the same index as one, so a second one is safe for availability.

The `connection` of `RedisSearchIndex` is an ioredis `Redis` or `Cluster` instance you own. The `connection` of `SearchIndexer` takes BullMQ connection options or an instance and defaults to the connection of the queue, and the indexer opens its own `QueueEvents` from it. `indexer.stop()` closes that and waits for the batch in flight; it does not close your connection or queue.

## Backfill and sweep

When it starts, the indexer opens the event feed from the checkpoint it stored last time, or from the beginning of the retained stream when there is none, and then runs a backfill. The backfill pages through the queue's existing jobs and indexes each of them, which covers jobs that predate the install and jobs added during a downtime longer than the event stream retains. Because the feed is already open when the backfill runs, jobs that change state during the backfill are picked up from their events. A backfill run on its own against a busy queue can miss jobs that change state while it pages, so `backfill()` is meant to run next to a live feed.

BullMQ removes jobs without an event in several cases: `removeOnComplete`, `removeOnFail`, `queue.clean`, `drain` and `obliterate`. The indexer therefore runs a sweep every `sweepEvery` milliseconds. Each sweep checks a batch of indexed job ids against the queue with an `EXISTS` on each job's key. An id whose key is missing is read once more through the queue before removal, which rarely finds the job, and the ids still gone are removed from every key they appear in. A batch in which more than half of the batch size is removed is followed by another sweep right away. A pass over the index takes its indexed job count divided by `sweepBatch` sweeps, `sweepEvery` milliseconds apart. When a pass has removed nothing, the next pass starts `sweepIdleEvery` milliseconds later instead of `sweepEvery`, so on an idle queue a job deleted without an event leaves the index within one pass plus `sweepIdleEvery`.

The indexer writes events in batches. If writing a batch keeps failing, the indexer retries it `maxRetries` times after the first attempt, then calls `onError` once for the batch with the ids of its jobs as `jobIds`, stores those ids in a retry set and moves on. The retry set is tried again at start, before every sweep and on every call to `indexer.sweep()`, so with `sweepEvery: false` it is tried at start and whenever the app calls `sweep()` itself.

## Recovery

When the retry set cannot be written either, as happens while the index's Redis is unreachable, the indexer keeps the batch in memory and does not move its checkpoint past it. It calls `onError` once with the batch's `jobIds` and tries the batch again after 500 milliseconds, doubling the wait up to 30 seconds, until the write goes through or `stop()` is called. Events that arrive in the meantime are buffered with the batch, so nothing is lost and the indexer does not stop. The buffer is held in memory, one entry per distinct job, until the index is reachable again. While a batch cannot be stored, the board shows the index as Degraded with the buffered jobs counted as pending retries, as long as the index's Redis can still take that note.

The heartbeat is written only while the event feed is open. If the feed ends while the indexer runs, the indexer stops the heartbeat, deletes it, reports the error through `onError` and opens the feed again from the checkpoint, with the same growing wait between attempts. The wait goes back to 500 milliseconds only once a reopened feed has stayed up for 5 seconds. An event BullMQ cannot parse ends the feed every time it is read, so the feed keeps ending and reopening, the board shows the index as Offline for most of that time, and `onError` receives the error on every reopen until the event is trimmed from the stream.

`start()` rejects when the feed is not ready within `startTimeout` milliseconds, for example because the event stream's Redis is unreachable, and the indexer then writes no heartbeat. `stop()` during such a start abandons it, and that `start()` resolves without starting. When `stop()` cannot delete the heartbeat, the indexer keeps trying with the same growing wait, and the board reads a heartbeat that has not been renewed for two intervals as Offline in any case.

## Reindexing

BullMQ emits no event for `job.updateData`, so a job whose payload changed stays indexed under its old values until something indexes it again. After changing data, call `reindex` with the queue and the ids of the jobs:

```ts
await job.updateData({ tenantId: 'acme' });
await search.reindex(ordersQueue, [job.id!]);
```

`reindex` reads each job and writes its entries again. An id whose job no longer exists is removed from the index. On a single `RedisSearchIndex` the same is available as `index.reindexJobs(jobIds)` for many ids and `index.reindex(jobId)` for one.

After you change the field definitions of a queue that already has an index, run `backfill`, which pages through the queue's jobs and indexes each of them under the current fields. Each job's entries under the previous field definitions are removed in the same write, so a removed or renamed field stops matching. Jobs that BullMQ already deleted keep their old entries until the sweep removes them:

```ts
await search.backfill(ordersQueue);
await search.backfill();
```

Called with a queue it backfills that queue, and called without arguments it backfills every added queue. Run it while the indexer is started, for the reason given under Backfill and sweep. `search.indexer(queue).backfill()` returns the number of jobs indexed and the duration in milliseconds, for callers that need them.

Jobs that BullMQ removes without an event, through `removeOnComplete`, `removeOnFail`, `queue.clean`, `drain` or `obliterate`, need no call: the sweep removes them from the index.

## Options

`RedisSearchIndex`:

| Option | Default | Meaning |
| --- | --- | --- |
| `connection` | required | ioredis `Redis` or `Cluster`. |
| `queue` | required | The BullMQ `Queue`, used for its name and to read jobs. |
| `fields` | required | Field definitions as described above. |
| `prefix` | `bull-board:search` | Key prefix. Index, indexer and provider must agree on it. |

`SearchIndexer`:

| Option | Default | Meaning |
| --- | --- | --- |
| `connection` | the queue's connection | Connection used for the queue event stream. |
| `startTimeout` | `30000` | Milliseconds `start()` waits for the event feed before it rejects. |
| `backfillOnStart` | `true` | Run a backfill after the feed opens. |
| `backfillBatchSize` | `500` | Jobs read per backfill batch. |
| `sweepEvery` | `5000` | Milliseconds between sweeps, or `false` to turn the sweep off. |
| `sweepIdleEvery` | `60000` | Milliseconds before the next pass after a pass that removed nothing. |
| `sweepBatch` | `5000` | Job ids checked per sweep. |
| `maxRetries` | `3` | Retries of a failing event after its first attempt, before it goes to the retry set. |
| `onError` | none | Called as `(error, { jobIds? })`, with `jobIds` set when the error concerns a batch of jobs. |

The indexer is an event emitter: it emits `indexed`, `removed`, `backfilled`, `swept` and `error`. An exception thrown by an `indexed` or `removed` listener is passed to `onError` and does not stop the indexer, and neither does an exception thrown by `onError` itself.

`createRedisSearchProvider(index)`: when the user has a status tab selected, the provider reads one page of matching ids from the index and asks BullMQ for the state of only those jobs, so a page can come back shorter than the page size or empty. It returns the page's cursor while the index has more matches. The UI keeps requesting pages and shows a loader until the results fill a page of 20, the cursor ends, or 5 further pages have been fetched, and "Load more" continues from there. Index writes from `reindex` and the status read retry briefly when a cluster slot is being moved.

The index also exposes `indexJob(job)`, `removeJob(jobId)` and `reindex(jobId)`, for apps that want a job indexed at the moment they add or change it.

## Diagnostics in the board

The provider reports on its own index, and the board shows it. The search row gains a pill reading Indexed, Degraded or Offline, and clicking it opens a Search index modal with the fields, when the indexer was last seen, when it last handled an event, the number of indexed jobs, pending retries, and the last backfill and sweep. The same modal has a Check coverage button, which compares the newest jobs of the queue against the index and lists the ones that are missing. The job page has a Search index section showing, for each field, the values extracted from that job and whether it is indexed under them.

The indexer writes a heartbeat every 5 seconds with a 30 second TTL. Health is Offline when the heartbeat is missing or has not been renewed for 10 seconds, or when no indexer has ever started on the queue. It is Degraded while a backfill is running or jobs sit in the retry set, and Indexed otherwise.

## Limitations

- `job.updateData` emits no event in BullMQ, so a changed payload is picked up by the next backfill, which runs at indexer start, or by `search.reindex(queue, jobIds)` or `index.reindex(jobId)`. Until then the job stays indexed under its old values.
- Jobs that BullMQ deletes without an event stay in the index until the sweep reaches them. The indexed-jobs number in the modal can therefore exceed the queue's job count until the sweep reaches those ids, which takes about the indexed job count divided by `sweepBatch`, times `sweepEvery`, plus up to `sweepIdleEvery` after a pass that removed nothing, and a search can return an id whose job is gone. The board drops such ids when it loads the jobs.
- Only Redis-backed BullMQ queues are supported. The legacy `bull` library has no resumable event stream, and the BullMQ 6 PostgreSQL backend is not supported.
- `backfillOnStart: false` leaves jobs unindexed that were added during an outage longer than the event stream retains, because the feed then resumes after them and no backfill covers them. Run `backfill()` after such an outage.
- Each indexer holds one blocking Redis connection for the queue's event stream, so a board that searches 50 queues keeps 50 such connections open, in addition to the shared `connection`.
- Matching is exact. There is no prefix, fuzzy or full-text search.
- The index takes about 560 bytes of Redis memory per job for two indexed fields, one with 100 distinct values and one unique per job. More fields and more distinct values cost more.

## Redis Cluster

All keys of one queue share a hash tag derived from the queue's qualified name, so they live in one slot and the multi-key writes and the paging script are legal on a cluster. Different queues land in different slots. A `prefix` that contains a hash tag, such as `{search}`, makes Redis hash only that tag, so every queue of the prefix lands in one slot and one node holds the whole index.

## Dragonfly

Dragonfly needs the `--default_lua_flags=allow-undeclared-keys` flag for the scripts of this package, as BullMQ itself does, because the scripts that write and remove entries touch keys they read from the job's key set at run time, and those keys are not passed as declared keys.
