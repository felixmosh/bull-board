---
description: The JSON API the bull-board dashboard serves, generated from the route table so it always matches the routes the board registers.
---

# HTTP API reference

> This page is generated from the route table in `@bull-board/api`. Do not edit it by hand: run
> `yarn workspace @bull-board/api openapi` instead. The same content is browsable as an
> [interactive reference](/api/), and machine-readable at
> [`openapi.json`](https://felixmosh.github.io/bull-board/openapi.json).

The dashboard's own UI is a client of this API and nothing else, so anything the UI can do is
available here. Every route is served relative to the base path you passed to `setBasePath()`. A
board mounted at `/admin/queues` serves `GET /admin/queues/api/queues`.

## Authentication

There is none. bull-board does not authenticate requests and never has: the board inherits
whatever protects the route it is mounted on, which is your application's own middleware. See
[basic auth](/recipes/basic-auth) for the standalone case, and
[access control hooks](/recipes/access-control-hooks) for per-route rules.

This matters when pointing a script or an agent at a running board. You send whatever credential
your own middleware expects, as an ordinary header, and bull-board neither issues nor validates
it.

## What can reject a call

A route existing in this document does not mean a given board will answer it.

- Queues registered with `readOnlyMode` reject every write with **405** and
  `ERRORS.QUEUE_READ_ONLY`.
- A [visibility guard](/recipes/visibility-guard) makes a queue answer **404** as though it were
  not registered.
- A [`handlerHooks.before`](/recipes/access-control-hooks) hook can reject any call, by default
  with **403** and `ERRORS.FORBIDDEN`.
- The four `/api/metrics/*` routes are registered only when a `historyProvider` is configured,
  and individually only when the provider implements the matching capability. Without one they
  are not mounted at all and answer **404**. See [historical metrics](/recipes/historical-metrics).

## Request validation

Every query string and request body documented here is checked against its schema before the
route runs, and a request that does not match is refused with **400** before anything is read or
written. The check runs after `handlerHooks.before`, so a hook that hides a route still answers
first and a malformed request cannot be used to discover that a hidden route exists.

Query values arrive as strings and are coerced by the schema, which is why parameters such as
`page` document a string alongside a number: the wire carries `page=2` and the handler receives
`2`. An empty value reads as an omitted one, so `?page=` is the same request as no `page` at all.

## Error bodies

Every failure returns `ErrorResponseBody`. Its `error` field is a translation key rather than a
sentence, because the API never puts user-facing English in a response and the client owns the
wording. `code` is the stable identifier to branch on when you handle a specific failure rather
than display it.

```json
{
  "error": { "key": "ERRORS.QUEUE_NOT_FOUND" },
  "message": { "key": "ERRORS.JOB_IS_ACTIVE_DETAILS", "options": { "jobId": "42" } },
  "code": "JOB_BELONGS_TO_JOB_SCHEDULER"
}
```

## Response shapes

Every response documented here is derived from the same schema the handler is type-checked
against, so a handler that stops returning what it advertises does not compile. A board can also
check its responses at runtime with `options.validateResponses`, which is meant for developing a
custom adapter or hook rather than for production.

## Versioning

The `info.version` in the spec describes the shape of this HTTP API and is deliberately
independent of the `@bull-board/api` package version, so a routine release does not churn the
generated artifacts.

## Queues

Board-level and per-queue operations. `GET /api/queues` is the one the dashboard polls: it returns counts for every queue the request may see, and the jobs of only the queue named in `activeQueue`, paged by `page` and `jobsPerPage`. Everything else here acts on a single queue named in the path, and is refused with **405** when that queue was registered read-only.

### `GET /api/queues`

List every visible queue with its job counts, and the jobs of the active queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `activeQueue` | query | no | string |
| `status` | query | no | Status |
| `page` | query | no | string |
| `jobsPerPage` | query | no | string |

Responds `200` with [`GetQueuesResponse`](#getqueuesresponse).

### `GET /api/queues/{queueName}/metrics`

Read the BullMQ completed and failed counter metrics of one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Responds `200` with [`GetQueueMetricsResponse`](#getqueuemetricsresponse).

### `GET /api/queues/{queueName}/default-job-options`

Read the default job options configured on one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Responds `200` with [`GetQueueDefaultJobOptionsResponse`](#getqueuedefaultjoboptionsresponse).

### `GET /api/queues/{queueName}/workers`

List the workers currently consuming one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Responds `200` with [`GetQueueWorkersResponse`](#getqueueworkersresponse).

### `GET /api/queues/{queueName}/rate-limit`

Read the configured rate limit of one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Responds `200` with [`GetQueueRateLimitResponse`](#getqueueratelimitresponse).

### `PUT /api/queues/{queueName}/rate-limit`

Set the rate limit of one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Request body: [`SetRateLimitBody`](#setratelimitbody)

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `GET /api/queues/{queueName}/job-data-schema`

Read the JSON Schema describing the job data of one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Responds `200` with [`GetQueueJobDataSchemaResponse`](#getqueuejobdataschemaresponse).

### `PUT /api/queues/pause`

Pause every writable queue on the board.

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/resume`

Resume every writable queue on the board.

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `POST /api/queues/{queueName}/add`

Add a job to one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Request body: [`AddJobBody`](#addjobbody)

Responds `200` with [`AddJobResponse`](#addjobresponse).

### `PUT /api/queues/{queueName}/retry/{queueStatus}`

Retry every job of one queue in the given status.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `queueStatus` | path | yes | string |

Responds `200` with [`RetryAllResponse`](#retryallresponse).

### `PUT /api/queues/{queueName}/promote`

Promote every delayed job of one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/{queueName}/clean/{queueStatus}`

Remove every job of one queue in the given status.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `queueStatus` | path | yes | string |

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/{queueName}/pause`

Pause one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/{queueName}/resume`

Resume one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/{queueName}/concurrency`

Set the global concurrency limit of one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Request body: [`SetGlobalConcurrencyBody`](#setglobalconcurrencybody)

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/{queueName}/rate-limit/release`

Release an active rate limit on one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/{queueName}/empty`

Remove every job from one queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/{queueName}/obliterate`

Obliterate one queue, removing the queue itself along with all of its jobs.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |

Request body: [`ObliterateQueueBody`](#obliteratequeuebody)

Responds `200` with [`EmptyResponse`](#emptyresponse).

## Jobs

Reads and mutations for one job, addressed by its queue and id. Removing a job that is the pending run of a job scheduler is refused with **400** and the `JOB_BELONGS_TO_JOB_SCHEDULER` code, because deleting it alone would leave the schedule registered but unable to fire again.

### `GET /api/queues/{queueName}/{jobId}/logs`

Read the logs of one job.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `jobId` | path | yes | string |

Responds `200` with [`GetJobLogsResponse`](#getjoblogsresponse).

### `GET /api/queues/{queueName}/{jobId}/flow`

Read the flow tree one job belongs to.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `jobId` | path | yes | string |
| `root` | query | no | any |
| `depth` | query | no | object |
| `maxChildren` | query | no | object |

Responds `200` with [`GetJobFlowResponse`](#getjobflowresponse).

### `GET /api/queues/{queueName}/{jobId}`

Read one job and its current status.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `jobId` | path | yes | string |

Responds `200` with [`GetJobResponse`](#getjobresponse).

### `PUT /api/queues/{queueName}/{jobId}/retry`

Retry one job.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `jobId` | path | yes | string |

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/{queueName}/{jobId}/clean`

Remove one job.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `jobId` | path | yes | string |

Responds `204` with no body.

### `PUT /api/queues/{queueName}/{jobId}/promote`

Promote one delayed job.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `jobId` | path | yes | string |

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PATCH /api/queues/{queueName}/{jobId}/update-data`

Replace the data of one job.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `jobId` | path | yes | string |

Request body: [`UpdateJobDataBody`](#updatejobdatabody)

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PATCH /api/queues/{queueName}/{jobId}/delay`

Reschedule one delayed job.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `jobId` | path | yes | string |

Request body: [`ChangeJobDelayBody`](#changejobdelaybody)

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PATCH /api/queues/{queueName}/{jobId}/priority`

Change the priority of one job.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `jobId` | path | yes | string |

Request body: [`ChangeJobPriorityBody`](#changejobprioritybody)

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/{queueName}/{jobId}/remove-unprocessed-children`

Remove the unprocessed children of one job.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `jobId` | path | yes | string |

Responds `200` with [`RemoveUnprocessedChildrenResponse`](#removeunprocessedchildrenresponse).

## Job schedulers

Repeatable job definitions, meaning the schedule itself rather than the runs it produces. Listing spans every visible queue unless you name one. Editing a schedule replaces it, so a body that sets neither a cron pattern nor an interval is rejected.

### `GET /api/job-schedulers`

List job schedulers across every visible queue, or one named queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | query | no | string |

Responds `200` with [`GetJobSchedulersResponse`](#getjobschedulersresponse).

### `PUT /api/queues/{queueName}/job-schedulers/{schedulerId}/remove`

Remove one job scheduler.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `schedulerId` | path | yes | string |

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PATCH /api/queues/{queueName}/job-schedulers/{schedulerId}`

Update the schedule of one job scheduler.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `schedulerId` | path | yes | string |

Request body: [`UpdateJobSchedulerBody`](#updatejobschedulerbody)

Responds `200` with [`EmptyResponse`](#emptyresponse).

### `PUT /api/queues/{queueName}/job-schedulers/{schedulerId}/run`

Run one job scheduler now, leaving its schedule untouched.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `queueName` | path | yes | string |
| `schedulerId` | path | yes | string |

Responds `200` with [`RunJobSchedulerResponse`](#runjobschedulerresponse).

## Metrics history

Long-retention counter and latency history. These routes exist only on a board configured with a `historyProvider`, and each one individually only when the provider implements the matching capability, so on a board without one they are not mounted and answer **404**.

### `GET /api/metrics/history`

Read recorded job counter history over a time range.

> Available only when: A `historyProvider` is configured on the board.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `from` | query | yes | string |
| `to` | query | yes | string |
| `granularity` | query | no | MetricsHistoryGranularity |
| `queue` | query | no | string |
| `metric` | query | no | MetricsHistoryMetric |

Responds `200` with [`GetMetricsHistoryResponse`](#getmetricshistoryresponse).

### `GET /api/metrics/history/usage`

Report how much storage the recorded history occupies.

> Available only when: A `historyProvider` is configured on the board. The provider implements `getUsage`.

Responds `200` with [`GetMetricsHistoryUsageResponse`](#getmetricshistoryusageresponse).

### `POST /api/metrics/history/purge`

Delete recorded history.

> Available only when: A `historyProvider` is configured on the board. The provider implements `purge` and the board is not read-only.

Request body: [`PurgeMetricsHistoryBody`](#purgemetricshistorybody)

Responds `200` with [`PurgeMetricsHistoryResponse`](#purgemetricshistoryresponse).

### `GET /api/metrics/latency`

Read recorded runtime or wait-time latency percentiles over a time range.

> Available only when: A `historyProvider` is configured on the board. The provider implements `getLatency`.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `metric` | query | yes | MetricsLatencyMetric |
| `from` | query | no | string |
| `to` | query | no | string |
| `granularity` | query | no | `hour` \| `day` \| `range` |
| `queue` | query | no | string |
| `percentiles` | query | no | string |

Responds `200` with [`GetMetricsLatencyResponse`](#getmetricslatencyresponse).

## Datastore

Statistics for the datastore behind the board's first registered queue. Answers **404** when that queue is backed by something other than Redis that cannot report them, and **403** when the board sets `hideRedisDetails`.

### `GET /api/redis/stats`

Read the datastore statistics of the board's first queue.

Responds `200` with [`GetRedisStatsResponse`](#getredisstatsresponse).

## Schemas

### AppJob

| Field | Type | Required |
| --- | --- | --- |
| `id` | string \| number \| null | no |
| `name` | string | yes |
| `timestamp` | number | yes |
| `processedOn` | number \| null | no |
| `processedBy` | string \| null | no |
| `finishedOn` | number \| null | no |
| `progress` | string \| boolean \| number \| object | yes |
| `attempts` | number | yes |
| `failedReason` | string | no |
| `stacktrace` | string[] | yes |
| `delay` | number | no |
| `opts` | any | yes |
| `data` | any | yes |
| `returnValue` | any | yes |
| `isFailed` | boolean | yes |
| `externalUrl` | ExternalJobUrl | no |
| `groupId` | string \| number | no |
| `priority` | number | no |
| `attemptsStarted` | number | no |
| `stalledCounter` | number | no |
| `deduplicationId` | string | no |
| `deferredFailure` | string | no |

### AppJobScheduler

| Field | Type | Required |
| --- | --- | --- |
| `id` | string | yes |
| `queueName` | string | yes |
| `name` | string | yes |
| `pattern` | string | no |
| `every` | number | no |
| `tz` | string | no |
| `limit` | number | no |
| `startDate` | number | no |
| `endDate` | number | no |
| `next` | number | no |
| `nextRunJobId` | string | no |
| `lastRun` | number | no |
| `lastRunJobId` | string | no |
| `iterationCount` | number | no |
| `template` | object | no |

### AppQueue

| Field | Type | Required |
| --- | --- | --- |
| `delimiter` | string | yes |
| `name` | string | yes |
| `displayName` | string | no |
| `description` | string | no |
| `counts` | JobCounts | yes |
| `jobs` | AppJob[] | yes |
| `statuses` | Status[] | yes |
| `pagination` | Pagination | yes |
| `readOnlyMode` | boolean | yes |
| `allowRetries` | boolean | yes |
| `allowCompletedRetries` | boolean | yes |
| `isPaused` | boolean | yes |
| `type` | QueueType | yes |
| `globalConcurrency` | number \| null | yes |
| `activeRateLimitTtl` | number | yes |
| `supportsGlobalRateLimit` | boolean | yes |
| `jobSchedulerCount` | number | yes |
| `hasWorkers` | boolean \| null | yes |

### ErrorResponseBody

| Field | Type | Required |
| --- | --- | --- |
| `error` | object | yes |
| `message` | string \| TranslatableMessage | no |
| `code` | string | no |
| `details` | string | no |

### ExternalJobUrl

| Field | Type | Required |
| --- | --- | --- |
| `displayText` | string | no |
| `href` | string | yes |

### FlowDependencies

| Field | Type | Required |
| --- | --- | --- |
| `processed` | number | yes |
| `unprocessed` | number | yes |
| `ignored` | number | yes |
| `failed` | number | yes |

### FlowNode

| Field | Type | Required |
| --- | --- | --- |
| `id` | string | yes |
| `name` | string | yes |
| `state` | string | yes |
| `progress` | string \| boolean \| number \| object | yes |
| `queueName` | string | yes |
| `children` | FlowNode[] | yes |
| `truncated` | boolean | no |
| `dependencies` | FlowDependencies | no |
| `ignoredChildFailureReasons` | object | no |

### JobCounts

`object`

### JobFlow

| Field | Type | Required |
| --- | --- | --- |
| `nodeId` | string | yes |
| `isFlowNode` | boolean | yes |
| `flowRoot` | FlowNode \| null | yes |

### JobState

``latest` \| `active` \| `waiting` \| `waiting-children` \| `prioritized` \| `completed` \| `failed` \| `delayed` \| `paused` \| `stuck` \| `unknown``

### JobStatus

``active` \| `waiting` \| `waiting-children` \| `prioritized` \| `completed` \| `failed` \| `delayed` \| `paused``

### MetricsHistoryGranularity

``hour` \| `day``

### MetricsHistoryMetric

``completed` \| `failed` \| `queueage``

### MetricsLatencyGranularity

``hour` \| `day` \| `range``

### MetricsLatencyMetric

``runtime` \| `waittime``

### MetricsHistoryPoint

| Field | Type | Required |
| --- | --- | --- |
| `ts` | number | yes |
| `value` | number | yes |

### MetricsHistoryPurgeResult

| Field | Type | Required |
| --- | --- | --- |
| `keysDeleted` | number | yes |
| `fieldsDeleted` | number | yes |

### MetricsHistoryQueueUsage

| Field | Type | Required |
| --- | --- | --- |
| `queue` | string | yes |
| `keys` | number | yes |
| `bytes` | number | yes |
| `minutes` | number | yes |
| `days` | string[] | yes |
| `tiers` | object | yes |

### MetricsHistoryTierUsage

| Field | Type | Required |
| --- | --- | --- |
| `keys` | number | yes |
| `bytes` | number | yes |

### MetricsHistoryUsage

| Field | Type | Required |
| --- | --- | --- |
| `keys` | number | yes |
| `bytes` | number | yes |
| `minutes` | number | yes |
| `oldestDay` | string \| null | yes |
| `newestDay` | string \| null | yes |
| `tiers` | object | yes |
| `queues` | MetricsHistoryQueueUsage[] | yes |

### MetricsLatencyPoint

| Field | Type | Required |
| --- | --- | --- |
| `ts` | number | yes |
| `count` | number | yes |
| `values` | object | yes |

### Pagination

| Field | Type | Required |
| --- | --- | --- |
| `pageCount` | number | yes |
| `range` | object | yes |

### QueueType

``bull` \| `bullmq``

### Status

``latest` \| `active` \| `waiting` \| `waiting-children` \| `prioritized` \| `completed` \| `failed` \| `delayed` \| `paused``

### QueueDefaultJobOptions

| Field | Type | Required |
| --- | --- | --- |
| `attempts` | number | no |
| `delay` | number | no |
| `priority` | number | no |
| `lifo` | boolean | no |
| `backoff` | number \| object | no |
| `removeOnComplete` | boolean \| number \| object | no |
| `removeOnFail` | boolean \| number \| object | no |

### QueueMetrics

| Field | Type | Required |
| --- | --- | --- |
| `meta` | object | yes |
| `data` | number[] | yes |
| `count` | number | yes |

### QueueRateLimit

| Field | Type | Required |
| --- | --- | --- |
| `max` | number | yes |
| `duration` | number | yes |

### QueueWorker

| Field | Type | Required |
| --- | --- | --- |
| `id` | string | yes |
| `name` | string \| null | yes |
| `addr` | string | yes |
| `age` | number | yes |

### RedisStats

| Field | Type | Required |
| --- | --- | --- |
| `backend` | `redis` \| `postgres` | no |
| `version` | string | yes |
| `mode` | `standalone` \| `sentinel` \| `cluster` | no |
| `port` | number | yes |
| `os` | string | no |
| `uptime` | number | yes |
| `memory` | object | no |
| `clients` | object | yes |

### TranslatableMessage

| Field | Type | Required |
| --- | --- | --- |
| `key` | `ERRORS.FORBIDDEN` \| `ERRORS.INTERNAL_SERVER_ERROR` \| `ERRORS.INVALID_BEFORE_DATE` \| `ERRORS.INVALID_CONCURRENCY` \| `ERRORS.INVALID_DATE_RANGE` \| `ERRORS.INVALID_GRANULARITY` \| `ERRORS.INVALID_METRIC` \| `ERRORS.INVALID_PRIORITY` \| `ERRORS.INVALID_QUEUE` \| `ERRORS.INVALID_QUERY_PARAM` \| `ERRORS.INVALID_RATE_LIMIT` \| `ERRORS.INVALID_REQUEST_BODY` \| `ERRORS.INVALID_RUN_AT` \| `ERRORS.INVALID_SCHEDULER_END_DATE` \| `ERRORS.INVALID_SCHEDULER_INTERVAL` \| `ERRORS.INVALID_SCHEDULER_LIMIT` \| `ERRORS.INVALID_SCHEDULER_PATTERN` \| `ERRORS.INVALID_SCHEDULER_SCHEDULE` \| `ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER` \| `ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER_DETAILS` \| `ERRORS.JOB_EDIT_NOT_SUPPORTED` \| `ERRORS.JOB_HAS_NO_UNPROCESSED_CHILDREN` \| `ERRORS.JOB_IS_ACTIVE` \| `ERRORS.JOB_IS_ACTIVE_DETAILS` \| `ERRORS.JOB_NOT_DELAYED` \| `ERRORS.JOB_NOT_FOUND` \| `ERRORS.JOB_NOT_RETRIABLE` \| `ERRORS.JOB_SCHEDULER_EDIT_NOT_SUPPORTED` \| `ERRORS.JOB_SCHEDULER_NOT_FOUND` \| `ERRORS.JOB_SCHEDULER_RUN_NOT_SUPPORTED` \| `ERRORS.JOB_UNPROCESSED_CHILDREN_NOT_SUPPORTED` \| `ERRORS.QUEUE_HAS_ACTIVE_JOBS` \| `ERRORS.QUEUE_HAS_ACTIVE_JOBS_DETAILS` \| `ERRORS.QUEUE_NOT_FOUND` \| `ERRORS.QUEUE_NOT_PAUSED` \| `ERRORS.QUEUE_READ_ONLY` \| `ERRORS.RATE_LIMIT_NOT_SUPPORTED` \| `ERRORS.REDIS_STATS_UNAVAILABLE` \| `ERRORS.REDIS_UNAVAILABLE` \| `ERRORS.STATUS_NOT_RETRIABLE` \| `ERRORS.WORKERS_DISABLED` | yes |
| `options` | object | no |

### GetQueuesResponse

| Field | Type | Required |
| --- | --- | --- |
| `queues` | AppQueue[] | yes |

### GetJobResponse

| Field | Type | Required |
| --- | --- | --- |
| `job` | AppJob | yes |
| `status` | JobState | yes |

### AddJobResponse

| Field | Type | Required |
| --- | --- | --- |
| `job` | AppJob | yes |
| `status` | JobState | yes |

### GetQueueMetricsResponse

| Field | Type | Required |
| --- | --- | --- |
| `completed` | QueueMetrics \| null | yes |
| `failed` | QueueMetrics \| null | yes |

### GetQueueDefaultJobOptionsResponse

| Field | Type | Required |
| --- | --- | --- |
| `attempts` | number | no |
| `delay` | number | no |
| `priority` | number | no |
| `lifo` | boolean | no |
| `backoff` | number \| object | no |
| `removeOnComplete` | boolean \| number \| object | no |
| `removeOnFail` | boolean \| number \| object | no |

### GetQueueJobDataSchemaResponse

`object`

### GetQueueRateLimitResponse

| Field | Type | Required |
| --- | --- | --- |
| `supported` | boolean | yes |
| `rateLimit` | QueueRateLimit \| null | yes |

### GetQueueWorkersResponse

| Field | Type | Required |
| --- | --- | --- |
| `workers` | QueueWorker[] \| null | yes |

### GetJobSchedulersResponse

| Field | Type | Required |
| --- | --- | --- |
| `schedulers` | AppJobScheduler[] | yes |

### RunJobSchedulerResponse

| Field | Type | Required |
| --- | --- | --- |
| `job` | AppJob | yes |

### GetJobLogsResponse

`string[]`

### GetJobFlowResponse

| Field | Type | Required |
| --- | --- | --- |
| `nodeId` | string | yes |
| `isFlowNode` | boolean | yes |
| `flowRoot` | FlowNode \| null | yes |

### GetRedisStatsResponse

`RedisStats \| object`

### GetMetricsHistoryResponse

| Field | Type | Required |
| --- | --- | --- |
| `completed` | MetricsHistoryPoint[] | no |
| `failed` | MetricsHistoryPoint[] | no |
| `queueage` | MetricsHistoryPoint[] | no |

### GetMetricsHistoryUsageResponse

| Field | Type | Required |
| --- | --- | --- |
| `keys` | number | yes |
| `bytes` | number | yes |
| `minutes` | number | yes |
| `oldestDay` | string \| null | yes |
| `newestDay` | string \| null | yes |
| `tiers` | object | yes |
| `queues` | MetricsHistoryQueueUsage[] | yes |

### GetMetricsLatencyResponse

`MetricsLatencyPoint[]`

### PurgeMetricsHistoryResponse

| Field | Type | Required |
| --- | --- | --- |
| `keysDeleted` | number | yes |
| `fieldsDeleted` | number | yes |

### RetryAllResponse

| Field | Type | Required |
| --- | --- | --- |
| `retried` | number | yes |
| `skipped` | number | yes |

### RemoveUnprocessedChildrenResponse

| Field | Type | Required |
| --- | --- | --- |
| `removed` | number | yes |

### EmptyResponse

| Field | Type | Required |
| --- | --- | --- |

### GetQueuesQuery

| Field | Type | Required |
| --- | --- | --- |
| `activeQueue` | string | no |
| `status` | Status | no |
| `page` | string | no |
| `jobsPerPage` | string | no |

### GetJobSchedulersQuery

| Field | Type | Required |
| --- | --- | --- |
| `queueName` | string | no |

### GetJobFlowQuery

| Field | Type | Required |
| --- | --- | --- |
| `root` | any | no |
| `depth` | object | no |
| `maxChildren` | object | no |

### GetMetricsHistoryQuery

| Field | Type | Required |
| --- | --- | --- |
| `from` | string | yes |
| `to` | string | yes |
| `granularity` | MetricsHistoryGranularity | no |
| `queue` | string | no |
| `metric` | MetricsHistoryMetric | no |

### GetMetricsLatencyQuery

| Field | Type | Required |
| --- | --- | --- |
| `metric` | MetricsLatencyMetric | yes |
| `from` | string | no |
| `to` | string | no |
| `granularity` | `hour` \| `day` \| `range` | no |
| `queue` | string | no |
| `percentiles` | string | no |

### AddJobBody

| Field | Type | Required |
| --- | --- | --- |
| `name` | string | no |
| `data` | any | no |
| `options` | object | no |

### UpdateJobDataBody

| Field | Type | Required |
| --- | --- | --- |
| `jobData` | any | yes |

### ChangeJobDelayBody

| Field | Type | Required |
| --- | --- | --- |
| `runAt` | number | yes |

### ChangeJobPriorityBody

| Field | Type | Required |
| --- | --- | --- |
| `priority` | integer | yes |

### SetGlobalConcurrencyBody

| Field | Type | Required |
| --- | --- | --- |
| `concurrency` | integer | yes |

### SetRateLimitBody

`object \| object`

### ObliterateQueueBody

| Field | Type | Required |
| --- | --- | --- |
| `force` | boolean | no |

### UpdateJobSchedulerBody

| Field | Type | Required |
| --- | --- | --- |
| `pattern` | string | no |
| `every` | string \| number \| null | no |
| `tz` | string | no |
| `limit` | integer \| null | no |
| `endDate` | string \| number \| null | no |

### PurgeMetricsHistoryBody

| Field | Type | Required |
| --- | --- | --- |
| `queue` | string | no |
| `before` | string | no |
