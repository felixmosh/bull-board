import * as v from 'valibot';
import { DATASTORES } from '../constants/datastores';
import { STATUSES } from '../constants/statuses';
import { ERROR_TRANSLATION_KEYS } from './errorKeys';
import { key, totalRecord } from './support';

const statusValues = Object.values(STATUSES);

export const statusSchema = v.picklist(statusValues);

export const jobStatusSchema = v.picklist(
  statusValues.filter((status): status is Exclude<typeof status, 'latest'> => status !== 'latest')
);

export const jobStateSchema = v.picklist([...statusValues, 'stuck', 'unknown'] as const);

export const datastoreSchema = v.picklist(Object.values(DATASTORES));

export const queueTypeSchema = v.picklist(['bull', 'bullmq'] as const);

export const jobCountsSchema = v.record(statusSchema, v.number());

export const paginationSchema = v.object({
  pageCount: v.number(),
  range: v.object({
    start: v.number(),
    end: v.number(),
  }),
});

export const externalJobUrlSchema = v.object({
  displayText: v.optional(v.string()),
  href: v.string(),
});

export const queueRateLimitSchema = v.object({
  max: v.number(),
  duration: v.number(),
});

export const jobRetentionOptionSchema = v.union([
  v.boolean(),
  v.number(),
  v.object({ age: v.optional(v.number()), count: v.optional(v.number()) }),
]);

export const queueDefaultJobOptionsSchema = v.looseObject({
  attempts: v.optional(v.number()),
  delay: v.optional(v.number()),
  priority: v.optional(v.number()),
  lifo: v.optional(v.boolean()),
  backoff: v.optional(
    v.union([v.number(), v.object({ type: v.string(), delay: v.optional(v.number()) })])
  ),
  removeOnComplete: v.optional(jobRetentionOptionSchema),
  removeOnFail: v.optional(jobRetentionOptionSchema),
});

export const queueWorkerSchema = v.object({
  id: v.pipe(v.string(), v.description('Redis client id of the worker connection.')),
  name: v.pipe(
    v.nullable(v.string()),
    v.description('The name the worker was created with, or null for an unnamed worker.')
  ),
  addr: v.pipe(v.string(), v.description('`ip:port` the worker connects from.')),
  age: v.pipe(v.number(), v.description('Seconds since the connection was opened.')),
});

export const redisStatsSchema = v.object({
  backend: v.optional(
    v.pipe(
      datastoreSchema,
      v.description('Absent on responses from older servers, which could only ever be Redis.')
    )
  ),
  version: v.string(),
  mode: v.optional(v.picklist(['standalone', 'sentinel', 'cluster'] as const)),
  port: v.number(),
  os: v.optional(v.string()),
  uptime: v.number(),
  memory: v.optional(
    v.pipe(
      v.object({
        total: v.number(),
        used: v.number(),
        fragmentationRatio: v.number(),
        peak: v.number(),
      }),
      v.description(
        'Redis only. PostgreSQL reports disk, which is not the same thing and is not shown.'
      )
    )
  ),
  clients: v.object({
    connected: v.number(),
    blocked: v.number(),
  }),
});

export const queueMetricsSchema = v.object({
  meta: v.object({
    count: v.number(),
    prevTS: v.number(),
    prevCount: v.number(),
  }),
  data: v.array(v.number()),
  count: v.number(),
});

export const appJobSchema = v.object({
  id: v.optional(v.nullable(v.union([v.string(), v.number()]))),
  name: v.string(),
  timestamp: v.number(),
  processedOn: v.optional(v.nullable(v.number())),
  processedBy: v.optional(v.nullable(v.string())),
  finishedOn: v.optional(v.nullable(v.number())),
  progress: v.union([v.string(), v.boolean(), v.number(), v.record(v.string(), v.any())]),
  attempts: v.number(),
  failedReason: v.optional(v.string()),
  stacktrace: v.array(v.string()),
  delay: v.optional(v.number()),
  opts: v.any(),
  data: v.any(),
  returnValue: v.any(),
  isFailed: v.boolean(),
  externalUrl: v.optional(externalJobUrlSchema),
  groupId: v.optional(v.union([v.string(), v.number()])),
  priority: v.optional(v.number()),
  attemptsStarted: v.optional(v.number()),
  stalledCounter: v.optional(v.number()),
  deduplicationId: v.optional(v.string()),
  deferredFailure: v.optional(v.string()),
});

export const flowDependenciesSchema = v.object({
  processed: v.number(),
  unprocessed: v.number(),
  ignored: v.number(),
  failed: v.number(),
});

export interface FlowNode {
  id: string;
  name: string;
  state: string;
  progress: string | boolean | number | Record<string, any>;
  queueName: string;
  children: FlowNode[];
  truncated?: boolean;
  dependencies?: v.InferOutput<typeof flowDependenciesSchema>;
  ignoredChildFailureReasons?: Record<string, string>;
}

export const flowNodeSchema: v.GenericSchema<FlowNode> = v.object({
  id: v.string(),
  name: v.string(),
  state: v.string(),
  progress: v.union([v.string(), v.boolean(), v.number(), v.record(v.string(), v.any())]),
  queueName: v.string(),
  children: v.array(v.lazy(() => flowNodeSchema)),
  truncated: v.optional(v.boolean()),
  dependencies: v.optional(flowDependenciesSchema),
  ignoredChildFailureReasons: v.optional(v.record(v.string(), v.string())),
});

export const jobFlowSchema = v.object({
  nodeId: v.string(),
  isFlowNode: v.boolean(),
  flowRoot: v.nullable(flowNodeSchema),
});

export const appJobSchedulerSchema = v.object({
  id: v.pipe(
    v.string(),
    v.description('Scheduler id in BullMQ, repeatable key in Bull. Unique within its queue.')
  ),
  queueName: v.string(),
  name: v.pipe(v.string(), v.description('Name of the job the scheduler produces.')),
  pattern: v.optional(v.string()),
  every: v.optional(v.number()),
  tz: v.optional(v.string()),
  limit: v.optional(v.number()),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  next: v.optional(v.pipe(v.number(), v.description('When the next run fires.'))),
  nextRunJobId: v.optional(
    v.pipe(
      v.string(),
      v.description(
        'The delayed job the next run will be, so the dashboard can link straight to it.'
      )
    )
  ),
  lastRun: v.optional(
    v.pipe(
      v.number(),
      v.description(
        'When the previous run started, derived from the pending delayed job. Absent when the scheduler has not run yet, when that job is gone, or on Bull, which cannot report it.'
      )
    )
  ),
  lastRunJobId: v.optional(
    v.pipe(
      v.string(),
      v.description(
        'The job the previous run was, when it can still be named and has not been trimmed away by `removeOnComplete` and friends. Absent for cron schedules, whose previous fire time cannot be worked out without parsing the pattern.'
      )
    )
  ),
  iterationCount: v.optional(v.number()),
  template: v.optional(
    v.object({
      data: v.optional(v.any()),
      opts: v.optional(v.record(v.string(), v.any())),
    })
  ),
});

export const appQueueSchema = v.object({
  delimiter: v.string(),
  name: v.string(),
  displayName: v.optional(v.string()),
  description: v.optional(v.string()),
  counts: jobCountsSchema,
  jobs: v.array(appJobSchema),
  statuses: v.array(statusSchema),
  pagination: paginationSchema,
  readOnlyMode: v.boolean(),
  allowRetries: v.boolean(),
  allowCompletedRetries: v.boolean(),
  isPaused: v.boolean(),
  type: queueTypeSchema,
  globalConcurrency: v.nullable(v.number()),
  activeRateLimitTtl: v.number(),
  supportsGlobalRateLimit: v.boolean(),
  jobSchedulerCount: v.number(),
  hasWorkers: v.pipe(
    v.nullable(v.boolean()),
    v.description(
      'Whether anything is currently consuming this queue. `null` means the question could not be answered, which is not the same as nobody being there: the adapter may not implement it, the Redis provider may block `CLIENT LIST`, or `showWorkers` may be off.'
    )
  ),
});

export const metricsHistoryGranularitySchema = v.picklist(
  ['hour', 'day'] as const,
  key('ERRORS.INVALID_GRANULARITY')
);

export const metricsLatencyGranularitySchema = v.picklist(['hour', 'day', 'range'] as const);

export const metricsHistoryMetricSchema = v.picklist(
  ['completed', 'failed', 'queueage'] as const,
  key('ERRORS.INVALID_METRIC')
);

export const metricsLatencyMetricSchema = v.picklist(
  ['runtime', 'waittime'] as const,
  key('ERRORS.INVALID_METRIC')
);

export const metricsHistoryPointSchema = v.object({
  ts: v.pipe(v.number(), v.description('Bucket start, epoch ms (UTC-aligned to the granularity).')),
  value: v.number(),
});

export const metricsLatencyPointSchema = v.object({
  ts: v.number(),
  count: v.pipe(
    v.number(),
    v.description(
      'Samples behind this point, so low-confidence points can be dimmed rather than drawn.'
    )
  ),
  values: v.pipe(
    v.record(v.string(), v.number()),
    v.description('Percentile to milliseconds, keyed by the stringified percentile.')
  ),
});

export const metricsHistoryTierUsageSchema = v.object({
  keys: v.number(),
  bytes: v.number(),
});

const tierUsageByTierSchema = totalRecord(
  ['minute', 'hour', 'day'] as const,
  metricsHistoryTierUsageSchema
);

export const metricsHistoryQueueUsageSchema = v.object({
  queue: v.string(),
  keys: v.number(),
  bytes: v.number(),
  minutes: v.number(),
  days: v.array(v.string()),
  tiers: tierUsageByTierSchema,
});

export const metricsHistoryUsageSchema = v.object({
  keys: v.number(),
  bytes: v.number(),
  minutes: v.number(),
  oldestDay: v.nullable(v.string()),
  newestDay: v.nullable(v.string()),
  tiers: tierUsageByTierSchema,
  queues: v.array(metricsHistoryQueueUsageSchema),
});

export const metricsHistoryPurgeResultSchema = v.object({
  keysDeleted: v.number(),
  fieldsDeleted: v.number(),
});

export const errorTranslationKeySchema = v.picklist(ERROR_TRANSLATION_KEYS);

export const translatableMessageSchema = v.object({
  key: errorTranslationKeySchema,
  options: v.optional(v.record(v.string(), v.any())),
});

export const errorResponseBodySchema = v.object({
  error: v.pipe(
    translatableMessageSchema,
    v.description(
      'Headline of the failure. Always a key, so it can never be untranslatable English.'
    )
  ),
  message: v.optional(
    v.pipe(
      v.union([v.string(), translatableMessageSchema]),
      v.description('Optional detail shown under the headline.')
    )
  ),
  code: v.optional(
    v.pipe(
      v.string(),
      v.description(
        'Stable identifier for clients that branch on a specific failure rather than display it.'
      )
    )
  ),
  details: v.optional(v.string()),
});

export const domainSchemas = {
  AppJob: appJobSchema,
  AppJobScheduler: appJobSchedulerSchema,
  AppQueue: appQueueSchema,
  ErrorResponseBody: errorResponseBodySchema,
  ExternalJobUrl: externalJobUrlSchema,
  FlowDependencies: flowDependenciesSchema,
  FlowNode: flowNodeSchema,
  JobCounts: jobCountsSchema,
  JobFlow: jobFlowSchema,
  JobState: jobStateSchema,
  JobStatus: jobStatusSchema,
  MetricsHistoryGranularity: metricsHistoryGranularitySchema,
  MetricsHistoryMetric: metricsHistoryMetricSchema,
  MetricsLatencyGranularity: metricsLatencyGranularitySchema,
  MetricsLatencyMetric: metricsLatencyMetricSchema,
  MetricsHistoryPoint: metricsHistoryPointSchema,
  MetricsHistoryPurgeResult: metricsHistoryPurgeResultSchema,
  MetricsHistoryQueueUsage: metricsHistoryQueueUsageSchema,
  MetricsHistoryTierUsage: metricsHistoryTierUsageSchema,
  MetricsHistoryUsage: metricsHistoryUsageSchema,
  MetricsLatencyPoint: metricsLatencyPointSchema,
  Pagination: paginationSchema,
  QueueType: queueTypeSchema,
  Status: statusSchema,
  QueueDefaultJobOptions: queueDefaultJobOptionsSchema,
  QueueMetrics: queueMetricsSchema,
  QueueRateLimit: queueRateLimitSchema,
  QueueWorker: queueWorkerSchema,
  RedisStats: redisStatsSchema,
  TranslatableMessage: translatableMessageSchema,
};
