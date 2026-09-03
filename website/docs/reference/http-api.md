---
description: The JSON API the bull-board dashboard serves, generated from the route table so it always matches the routes the board registers.
---

# HTTP API reference

> This page is generated from the route table in `@bull-board/api`. Do not edit it by hand: run
> `yarn workspace @bull-board/api openapi` instead. The machine-readable version of the same
> content is published at
> [`openapi.json`](https://felixmosh.github.io/bull-board/openapi.json).

The dashboard's own UI is a client of this API and nothing else, so anything the UI can do is
available here. Every route below is served relative to the base path you passed to
`setBasePath()`. A board mounted at `/admin/queues` serves `GET /admin/queues/api/queues`.

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

## Versioning

The `info.version` in the spec describes the shape of this HTTP API and is deliberately
independent of the `@bull-board/api` package version, so a routine release does not churn the
generated artifacts.

## Datastore

### `GET /api/redis/stats`

Read the datastore statistics of the board's first queue.

Responds `200` with [`GetRedisStatsResponse`](#getredisstatsresponse).

## Job schedulers

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

## Jobs

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
| `root` | query | no | string |
| `depth` | query | no | number |
| `maxChildren` | query | no | number |

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

## Metrics history

### `GET /api/metrics/history`

Read recorded job counter history over a time range.

> Available only when: A `historyProvider` is configured on the board.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `from` | query | yes | number |
| `to` | query | yes | number |
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

Responds `200` with [`PurgeMetricsHistoryResponse`](#purgemetricshistoryresponse).

### `GET /api/metrics/latency`

Read recorded runtime or wait-time latency percentiles over a time range.

> Available only when: A `historyProvider` is configured on the board. The provider implements `getLatency`.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `metric` | query | yes | MetricsLatencyMetric |
| `from` | query | no | number |
| `to` | query | no | number |
| `granularity` | query | no | MetricsLatencyGranularity |
| `queue` | query | no | string |
| `percentiles` | query | no | string |

Responds `200` with [`GetMetricsLatencyResponse`](#getmetricslatencyresponse).

## Queues

### `GET /api/queues`

List every visible queue with its job counts, and the jobs of the active queue.

| Parameter | In | Required | Type |
| --- | --- | --- | --- |
| `activeQueue` | query | no | string |
| `status` | query | no | JobStatus \| string |
| `page` | query | no | number |
| `jobsPerPage` | query | no | number |

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

## Schemas

### GetQueuesResponse

| Field | Type | Required |
| --- | --- | --- |
| `queues` | AppQueue[] | yes |

### AppQueue

| Field | Type | Required |
| --- | --- | --- |
| `delimiter` | string | yes |
| `name` | string | yes |
| `displayName` | string | no |
| `description` | string | no |
| `counts` | object | yes |
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
| `failedReason` | string | yes |
| `stacktrace` | string[] | yes |
| `delay` | number | no |
| `opts` | any | yes |
| `data` | any | yes |
| `returnValue` | any | yes |
| `isFailed` | boolean | yes |
| `externalUrl` | object | no |
| `groupId` | string \| number | no |
| `priority` | number | no |
| `attemptsStarted` | number | no |
| `stalledCounter` | number | no |
| `deduplicationId` | string | no |
| `deferredFailure` | string | no |

### Status

`BullMQStatuses`

### BullMQStatuses

`STATUSES`

### STATUSES

``latest` \| `active` \| `waiting` \| `waiting-children` \| `prioritized` \| `completed` \| `failed` \| `delayed` \| `paused``

### Pagination

| Field | Type | Required |
| --- | --- | --- |
| `pageCount` | number | yes |
| `range` | object | yes |

### QueueType

``bull` \| `bullmq``

### GetJobResponse

| Field | Type | Required |
| --- | --- | --- |
| `job` | AppJob | yes |
| `status` | JobState | yes |

### JobState

`Status \| string \| string \| string \| string`

### AddJobResponse

`GetJobResponse`

### GetQueueMetricsResponse

| Field | Type | Required |
| --- | --- | --- |
| `completed` | QueueMetrics \| null | yes |
| `failed` | QueueMetrics \| null | yes |

### QueueMetrics

| Field | Type | Required |
| --- | --- | --- |
| `meta` | object | yes |
| `data` | number[] | yes |
| `count` | number | yes |

### GetQueueDefaultJobOptionsResponse

`QueueDefaultJobOptions`

### QueueDefaultJobOptions

| Field | Type | Required |
| --- | --- | --- |
| `attempts` | number | no |
| `delay` | number | no |
| `priority` | number | no |
| `lifo` | boolean | no |
| `backoff` | number \| object | no |
| `removeOnComplete` | JobRetentionOption | no |
| `removeOnFail` | JobRetentionOption | no |

### JobRetentionOption

`boolean \| number \| object`

### GetQueueJobDataSchemaResponse

`object`

### GetQueueRateLimitResponse

| Field | Type | Required |
| --- | --- | --- |
| `supported` | boolean | yes |
| `rateLimit` | QueueRateLimit \| null | yes |

### QueueRateLimit

| Field | Type | Required |
| --- | --- | --- |
| `max` | number | yes |
| `duration` | number | yes |

### GetQueueWorkersResponse

| Field | Type | Required |
| --- | --- | --- |
| `workers` | QueueWorker[] \| null | yes |

### QueueWorker

| Field | Type | Required |
| --- | --- | --- |
| `id` | string | yes |
| `name` | string \| null | yes |
| `addr` | string | yes |
| `age` | number | yes |

### GetJobSchedulersResponse

| Field | Type | Required |
| --- | --- | --- |
| `schedulers` | AppJobScheduler[] | yes |

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

### GetJobLogsResponse

`string[]`

### GetJobFlowResponse

`JobFlow`

### JobFlow

| Field | Type | Required |
| --- | --- | --- |
| `nodeId` | string | yes |
| `isFlowNode` | boolean | yes |
| `flowRoot` | FlowNode \| null | yes |

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

### FlowDependencies

| Field | Type | Required |
| --- | --- | --- |
| `processed` | number | yes |
| `unprocessed` | number | yes |
| `ignored` | number | yes |
| `failed` | number | yes |

### GetRedisStatsResponse

`RedisStats \| object`

### RedisStats

| Field | Type | Required |
| --- | --- | --- |
| `backend` | DATASTORES | no |
| `version` | string | yes |
| `mode` | `standalone` \| `sentinel` \| `cluster` | no |
| `port` | number | yes |
| `os` | string | no |
| `uptime` | number | yes |
| `memory` | object | no |
| `clients` | object | yes |

### DATASTORES

``redis` \| `postgres``

### GetMetricsHistoryResponse

| Field | Type | Required |
| --- | --- | --- |
| `completed` | MetricsHistoryPoint[] | no |
| `failed` | MetricsHistoryPoint[] | no |
| `queueage` | MetricsHistoryPoint[] | no |

### MetricsHistoryPoint

| Field | Type | Required |
| --- | --- | --- |
| `ts` | number | yes |
| `value` | number | yes |

### GetMetricsHistoryUsageResponse

`MetricsHistoryUsage`

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

### MetricsHistoryTierUsage

| Field | Type | Required |
| --- | --- | --- |
| `keys` | number | yes |
| `bytes` | number | yes |

### MetricsHistoryQueueUsage

| Field | Type | Required |
| --- | --- | --- |
| `queue` | string | yes |
| `keys` | number | yes |
| `bytes` | number | yes |
| `minutes` | number | yes |
| `days` | string[] | yes |
| `tiers` | object | yes |

### GetMetricsLatencyResponse

`MetricsLatencyPoint[]`

### MetricsLatencyPoint

| Field | Type | Required |
| --- | --- | --- |
| `ts` | number | yes |
| `count` | number | yes |
| `values` | object | yes |

### PurgeMetricsHistoryResponse

`MetricsHistoryPurgeResult`

### MetricsHistoryPurgeResult

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

`object`

### GetQueuesQuery

| Field | Type | Required |
| --- | --- | --- |
| `activeQueue` | string | no |
| `status` | JobStatus \| string | no |
| `page` | number | no |
| `jobsPerPage` | number | no |

### JobStatus

``active` \| `waiting` \| `waiting-children` \| `prioritized` \| `completed` \| `failed` \| `delayed` \| `paused``

### GetJobSchedulersQuery

| Field | Type | Required |
| --- | --- | --- |
| `queueName` | string | no |

### GetJobFlowQuery

| Field | Type | Required |
| --- | --- | --- |
| `root` | string | no |
| `depth` | number | no |
| `maxChildren` | number | no |

### GetMetricsHistoryQuery

| Field | Type | Required |
| --- | --- | --- |
| `from` | number | yes |
| `to` | number | yes |
| `granularity` | MetricsHistoryGranularity | no |
| `queue` | string | no |
| `metric` | MetricsHistoryMetric | no |

### MetricsHistoryGranularity

``hour` \| `day``

### MetricsHistoryMetric

`MetricsType \| string`

### MetricsType

``completed` \| `failed``

### GetMetricsLatencyQuery

| Field | Type | Required |
| --- | --- | --- |
| `metric` | MetricsLatencyMetric | yes |
| `from` | number | no |
| `to` | number | no |
| `granularity` | MetricsLatencyGranularity | no |
| `queue` | string | no |
| `percentiles` | string | no |

### MetricsLatencyMetric

``runtime` \| `waittime``

### MetricsLatencyGranularity

`MetricsHistoryGranularity \| string`

### AddJobBody

| Field | Type | Required |
| --- | --- | --- |
| `name` | string | yes |
| `data` | object | no |
| `options` | object | no |

### UpdateJobDataBody

| Field | Type | Required |
| --- | --- | --- |
| `jobData` | object | yes |

### ChangeJobDelayBody

| Field | Type | Required |
| --- | --- | --- |
| `runAt` | number | yes |

### ChangeJobPriorityBody

| Field | Type | Required |
| --- | --- | --- |
| `priority` | number | yes |

### SetGlobalConcurrencyBody

| Field | Type | Required |
| --- | --- | --- |
| `concurrency` | number | yes |

### SetRateLimitBody

| Field | Type | Required |
| --- | --- | --- |
| `max` | number | no |
| `duration` | number | no |

### ObliterateQueueBody

| Field | Type | Required |
| --- | --- | --- |
| `force` | boolean | no |

### UpdateJobSchedulerBody

| Field | Type | Required |
| --- | --- | --- |
| `pattern` | string | no |
| `every` | number \| string | no |
| `tz` | string | no |
| `limit` | number | no |
| `endDate` | number \| string | no |

### ErrorResponseBody

| Field | Type | Required |
| --- | --- | --- |
| `error` | TranslatableMessage | yes |
| `message` | ErrorMessage | no |
| `code` | string | no |
| `details` | string | no |

### TranslatableMessage

| Field | Type | Required |
| --- | --- | --- |
| `key` | ErrorTranslationKey | yes |
| `options` | object | no |

### ErrorTranslationKey

``ERRORS.FORBIDDEN` \| `ERRORS.INTERNAL_SERVER_ERROR` \| `ERRORS.INVALID_BEFORE_DATE` \| `ERRORS.INVALID_CONCURRENCY` \| `ERRORS.INVALID_DATE_RANGE` \| `ERRORS.INVALID_GRANULARITY` \| `ERRORS.INVALID_METRIC` \| `ERRORS.INVALID_PRIORITY` \| `ERRORS.INVALID_QUEUE` \| `ERRORS.INVALID_RATE_LIMIT` \| `ERRORS.INVALID_RUN_AT` \| `ERRORS.INVALID_SCHEDULER_END_DATE` \| `ERRORS.INVALID_SCHEDULER_INTERVAL` \| `ERRORS.INVALID_SCHEDULER_LIMIT` \| `ERRORS.INVALID_SCHEDULER_PATTERN` \| `ERRORS.INVALID_SCHEDULER_SCHEDULE` \| `ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER` \| `ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER_DETAILS` \| `ERRORS.JOB_EDIT_NOT_SUPPORTED` \| `ERRORS.JOB_HAS_NO_UNPROCESSED_CHILDREN` \| `ERRORS.JOB_IS_ACTIVE` \| `ERRORS.JOB_IS_ACTIVE_DETAILS` \| `ERRORS.JOB_NOT_DELAYED` \| `ERRORS.JOB_NOT_FOUND` \| `ERRORS.JOB_UNPROCESSED_CHILDREN_NOT_SUPPORTED` \| `ERRORS.JOB_NOT_RETRIABLE` \| `ERRORS.JOB_SCHEDULER_EDIT_NOT_SUPPORTED` \| `ERRORS.JOB_SCHEDULER_NOT_FOUND` \| `ERRORS.QUEUE_HAS_ACTIVE_JOBS` \| `ERRORS.QUEUE_HAS_ACTIVE_JOBS_DETAILS` \| `ERRORS.QUEUE_NOT_FOUND` \| `ERRORS.QUEUE_NOT_PAUSED` \| `ERRORS.QUEUE_READ_ONLY` \| `ERRORS.RATE_LIMIT_NOT_SUPPORTED` \| `ERRORS.REDIS_STATS_UNAVAILABLE` \| `ERRORS.REDIS_UNAVAILABLE` \| `ERRORS.STATUS_NOT_RETRIABLE` \| `ERRORS.WORKERS_DISABLED``

### ErrorMessage

`string \| TranslatableMessage`
