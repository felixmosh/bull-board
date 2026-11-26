# @bull-board/search-redis

Opt-in Redis-backed job search for [bull-board](https://github.com/felixmosh/bull-board).

It indexes the jobs of BullMQ queues into Redis and answers the `JobSearchProvider` that bull-board's search box calls. The core `@bull-board/api` stays stateless: nothing is indexed unless you create the pieces below. Search is an exact match on a field you chose, such as `data.tenantId`, with the newest jobs first.

## Install

```bash
npm install @bull-board/search-redis
```

`bullmq` (`^5.56.0 || ^6.0.0`) and `ioredis` (`^5.0.0 || ^6.0.0`) are peer dependencies, and `@bull-board/api` is a peer so the types match the board you run. Node 20 or newer.

## The three pieces

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

const indexer = new SearchIndexer(index, { connection });
await indexer.start();

createBullBoard({
  queues: [new BullMQAdapter(ordersQueue, { search: createRedisSearchProvider(index) })],
  serverAdapter,
});
```

The indexer finds jobs from every producer, including other services, flows, job schedulers and retries, because it reads the queue's event stream and not the calls your own code makes. Your code does not need to add jobs through this package.

When your app's ioredis and the copy bullmq ships with differ in type, pass connection options instead of an instance to `Queue` and `SearchIndexer`. The `connection` of `RedisSearchIndex` is always an ioredis `Redis` or `Cluster` instance.

## Fields

Each key of `fields` is the name shown in the board. Its value is one of:

- a string path into the job, written with dots and nothing else, such as `'data.tenantId'`, `'name'` or `'opts.priority'`;
- a function `(job) => unknown`;
- an object `{ path, normalize? }` or `{ extract, normalize? }`.

The result becomes zero or more index values. Strings are used as they are, finite numbers and booleans go through `String()`, arrays contribute each element under the same rules, and anything else (`null`, `undefined`, objects, non-finite numbers) produces no entry. `normalize` runs on each stored string and on the value being searched, so a lower-casing normalizer makes that field match without regard to case.

## Where to run the indexer

The indexer needs to run in a process that stays up. It can live in a worker process, in the app that serves the board, or in a process of its own. `RedisSearchIndex` and `createRedisSearchProvider` are what the board process needs, and the indexer can be elsewhere as long as it uses the same queue, the same `prefix` and the same fields. Two indexers on one queue produce the same index as one, so a second one is safe for availability.

The `connection` of `RedisSearchIndex` is an ioredis `Redis` or `Cluster` instance you own. The `connection` of `SearchIndexer` takes BullMQ connection options or an instance, and the indexer opens its own `QueueEvents` from it. `indexer.stop()` closes that and waits for the batch in flight; it does not close your connection or queue.

## Backfill and sweep

When it starts, the indexer opens the event feed from the checkpoint it stored last time, or from the beginning of the retained stream when there is none, and then runs a backfill. The backfill pages through the queue's existing jobs and indexes each of them, which covers jobs that predate the install and jobs added during a downtime longer than the event stream retains. Because the feed is already open when the backfill runs, jobs that change state during the backfill are picked up from their events. A backfill run on its own against a busy queue can miss jobs that change state while it pages, so `backfill()` is meant to run next to a live feed.

BullMQ removes jobs without an event in several cases: `removeOnComplete`, `removeOnFail`, `queue.clean`, `drain` and `obliterate`. The indexer therefore runs a sweep every `sweepEvery` milliseconds. Each sweep checks a batch of indexed job ids against the queue and removes the ones whose job is gone, from every key they appear in. A batch in which more than half of the ids are gone is followed by another sweep right away.

If indexing one event keeps failing, the indexer retries it `maxRetries` times after the first attempt, then reports it through `onError`, stores the job id in a retry set and moves on. The retry set is tried again at start, before every sweep and on every call to `indexer.sweep()`, so with `sweepEvery: false` it is tried at start and whenever the app calls `sweep()` itself.

If the retry set itself cannot be written, the indexer stops. It reports the error through `onError`, emits `error` when a listener is attached, and stays stopped until the app calls `start()` again. A stopped indexer writes no heartbeat, so the board shows the index as Offline in the meantime.

## Options

`RedisSearchIndex`:

| Option | Default | Meaning |
| --- | --- | --- |
| `connection` | required | ioredis `Redis` or `Cluster`. |
| `queue` | required | The BullMQ `Queue`, used for its name and to read jobs. |
| `fields` | required | Field definitions as described above. |
| `prefix` | `bull-board-search` | Key prefix. Index, indexer and provider must agree on it. |

`SearchIndexer`:

| Option | Default | Meaning |
| --- | --- | --- |
| `connection` | required | Connection used for the queue event stream. |
| `backfillOnStart` | `true` | Run a backfill after the feed opens. |
| `backfillBatchSize` | `500` | Jobs read per backfill batch. |
| `sweepEvery` | `5000` | Milliseconds between sweeps, or `false` to turn the sweep off. |
| `sweepBatch` | `1000` | Job ids checked per sweep. |
| `maxRetries` | `3` | Retries of a failing event after its first attempt, before it goes to the retry set. |
| `onError` | none | Called as `(error, { jobId? })`. |

The indexer is an event emitter: it emits `indexed`, `removed`, `backfilled`, `swept` and `error`. An exception thrown by an `indexed` or `removed` listener is passed to `onError` and does not stop the indexer, and neither does an exception thrown by `onError` itself.

`createRedisSearchProvider(index, { statusScanBudget })`: when the user has a status tab selected, the provider asks BullMQ for the state of each candidate until it has a page or has examined `statusScanBudget` candidates, which defaults to ten times the page size. It returns a cursor while candidates remain, so "Load more" keeps working on sparse matches.

The index also exposes `indexJob(job)`, `removeJob(jobId)` and `reindex(jobId)`, for apps that want a job indexed at the moment they add or change it.

## Diagnostics in the board

The provider reports on its own index, and the board shows it. The search row gains a pill reading Indexed, Degraded or Offline, and clicking it opens a Search index modal with the fields, when the indexer was last seen, when it last handled an event, the number of indexed jobs, pending retries, and the last backfill and sweep. The same modal has a Check coverage button, which compares the newest jobs of the queue against the index and lists the ones that are missing. The job page has a Search index section showing, for each field, the values extracted from that job and whether it is indexed under them.

The indexer writes a heartbeat every 5 seconds with a 30 second TTL. Health is Offline when the heartbeat is missing or older than 30 seconds, or when no indexer has ever started on the queue. It is Degraded while a backfill is running or jobs sit in the retry set, and Indexed otherwise.

## Limitations

- `job.updateData` emits no event in BullMQ, so a changed payload is picked up by the next backfill, which runs at indexer start, or by `index.reindex(jobId)`. Until then the job stays indexed under its old values.
- Jobs that BullMQ deletes without an event stay in the index until the sweep reaches them. The indexed-jobs number in the modal can therefore exceed the queue's job count for a few seconds, and a search can return an id whose job is gone. The board drops such ids when it loads the jobs.
- Only Redis-backed BullMQ queues are supported. The legacy `bull` library has no resumable event stream, and the BullMQ 6 PostgreSQL backend is not supported.
- Matching is exact. There is no prefix, fuzzy or full-text search.
- The index takes about 560 bytes of Redis memory per job for two indexed fields, one with 100 distinct values and one unique per job. More fields and more distinct values cost more.

## Redis Cluster

All keys of one queue share a hash tag derived from the queue's qualified name, so they live in one slot and the multi-key writes and the paging script are legal on a cluster. Different queues land in different slots.
