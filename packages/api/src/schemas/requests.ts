import * as v from 'valibot';
import {
  metricsHistoryGranularitySchema,
  metricsHistoryMetricSchema,
  metricsLatencyGranularitySchema,
  metricsLatencyMetricSchema,
  statusSchema,
} from './domain';
import { key } from './support';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function queryInteger(message: string, minimum: number) {
  return v.pipe(
    v.string(message),
    v.toNumber(message),
    v.integer(message),
    v.minValue(minimum, message)
  );
}

function queryFinite(message: string) {
  return v.pipe(v.string(message), v.toNumber(message), v.finite(message));
}

// A JSON body may carry either, unlike a query string, which is always text.
const bodyNumber = (message: string) =>
  v.pipe(v.union([v.string(), v.number()], message), v.toNumber(message), v.finite(message));

// Deliberately clamps instead of rejecting: the flow window is a display concern.
function clampedInteger(fallback: number, minimum: number, maximum: number) {
  return v.pipe(
    v.unknown(),
    v.transform((raw) => {
      const parsed = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : Number.NaN;
      if (raw === '' || raw === null || raw === undefined || !Number.isInteger(parsed)) {
        return fallback;
      }
      return Math.min(Math.max(parsed, minimum), maximum);
    })
  );
}

export const getQueuesQuerySchema = v.object({
  activeQueue: v.optional(v.string()),
  status: v.optional(statusSchema),
  page: v.optional(queryInteger(key('ERRORS.INVALID_QUERY_PARAM'), 1), '1'),
  jobsPerPage: v.optional(queryInteger(key('ERRORS.INVALID_QUERY_PARAM'), 1), '10'),
});

export const getJobSchedulersQuerySchema = v.partial(v.object({ queueName: v.string() }));

export const getJobFlowQuerySchema = v.object({
  root: v.optional(
    v.pipe(
      v.unknown(),
      v.transform((raw) => (raw === 'node' ? ('node' as const) : undefined))
    )
  ),
  depth: v.optional(clampedInteger(10, 1, 20), 10),
  maxChildren: v.optional(clampedInteger(20, 1, 1000), 20),
});

export const getMetricsHistoryQuerySchema = v.pipe(
  v.object(
    {
      from: queryFinite(key('ERRORS.INVALID_DATE_RANGE')),
      to: queryFinite(key('ERRORS.INVALID_DATE_RANGE')),
      granularity: v.optional(metricsHistoryGranularitySchema, 'day'),
      queue: v.optional(v.string()),
      metric: v.optional(metricsHistoryMetricSchema),
    },
    key('ERRORS.INVALID_DATE_RANGE')
  ),
  v.check(({ from, to }) => to >= from, key('ERRORS.INVALID_DATE_RANGE'))
);

export const getMetricsLatencyQuerySchema = v.object(
  {
    metric: metricsLatencyMetricSchema,
    from: v.optional(queryFinite(key('ERRORS.INVALID_DATE_RANGE'))),
    to: v.optional(queryFinite(key('ERRORS.INVALID_DATE_RANGE'))),
    granularity: v.optional(v.fallback(metricsLatencyGranularitySchema, 'day'), 'day'),
    queue: v.optional(v.string()),
    percentiles: v.optional(v.string()),
  },
  key('ERRORS.INVALID_METRIC')
);

export const addJobBodySchema = v.object({
  name: v.optional(v.string(key('ERRORS.INVALID_REQUEST_BODY')), ''),
  data: v.optional(v.any()),
  options: v.optional(v.record(v.string(), v.any()), {}),
});

export const updateJobDataBodySchema = v.object({
  jobData: v.any(),
});

export const changeJobDelayBodySchema = v.object(
  {
    runAt: v.pipe(
      v.number(key('ERRORS.INVALID_RUN_AT')),
      v.check((value) => Number.isFinite(value), key('ERRORS.INVALID_RUN_AT'))
    ),
  },
  key('ERRORS.INVALID_RUN_AT')
);

const PRIORITY_LIMIT = 2 ** 21 - 1;
const priorityMessage = key('ERRORS.INVALID_PRIORITY', { max: PRIORITY_LIMIT });

export const changeJobPriorityBodySchema = v.object(
  {
    priority: v.pipe(
      v.number(priorityMessage),
      v.integer(priorityMessage),
      v.minValue(0, priorityMessage),
      v.maxValue(PRIORITY_LIMIT, priorityMessage)
    ),
  },
  priorityMessage
);

export const setGlobalConcurrencyBodySchema = v.object(
  {
    concurrency: v.pipe(
      v.number(key('ERRORS.INVALID_CONCURRENCY')),
      v.integer(key('ERRORS.INVALID_CONCURRENCY')),
      v.minValue(0, key('ERRORS.INVALID_CONCURRENCY'))
    ),
  },
  key('ERRORS.INVALID_CONCURRENCY')
);

const positiveInteger = (message: string) =>
  v.pipe(v.number(message), v.integer(message), v.minValue(1, message));

// A null `max` is how the dashboard asks for the limit to be removed, so it is a legal body.
export const setRateLimitBodySchema = v.union(
  [
    v.object({
      max: v.optional(v.null()),
      duration: v.optional(v.any()),
    }),
    v.object({
      max: positiveInteger(key('ERRORS.INVALID_RATE_LIMIT')),
      duration: positiveInteger(key('ERRORS.INVALID_RATE_LIMIT')),
    }),
  ],
  key('ERRORS.INVALID_RATE_LIMIT')
);

export const obliterateQueueBodySchema = v.partial(v.object({ force: v.boolean() }));

const schedulerInterval = v.pipe(
  bodyNumber(key('ERRORS.INVALID_SCHEDULER_INTERVAL')),
  v.gtValue(0, key('ERRORS.INVALID_SCHEDULER_INTERVAL'))
);

export const updateJobSchedulerBodySchema = v.pipe(
  v.partial(
    v.object({
      pattern: v.string(),
      every: v.nullable(schedulerInterval),
      tz: v.string(),
      limit: v.nullable(
        v.pipe(
          v.number(key('ERRORS.INVALID_SCHEDULER_LIMIT')),
          v.integer(key('ERRORS.INVALID_SCHEDULER_LIMIT')),
          v.minValue(1, key('ERRORS.INVALID_SCHEDULER_LIMIT'))
        )
      ),
      endDate: v.nullable(
        v.pipe(
          bodyNumber(key('ERRORS.INVALID_SCHEDULER_END_DATE')),
          v.check((value) => value > Date.now(), key('ERRORS.INVALID_SCHEDULER_END_DATE'))
        )
      ),
    })
  ),
  v.check((body) => {
    const hasPattern = typeof body.pattern === 'string' && body.pattern.trim().length > 0;
    const hasEvery = body.every !== undefined && body.every !== null;
    return hasPattern !== hasEvery;
  }, key('ERRORS.INVALID_SCHEDULER_SCHEDULE'))
);

export const purgeMetricsHistoryBodySchema = v.partial(
  v.object({
    queue: v.string(key('ERRORS.INVALID_QUEUE')),
    before: v.pipe(
      v.string(key('ERRORS.INVALID_BEFORE_DATE')),
      v.regex(DAY_PATTERN, key('ERRORS.INVALID_BEFORE_DATE')),
      v.description(
        'ISO `YYYY-MM-DD`. Drops days strictly before it; omit to drop everything in scope.'
      )
    ),
  })
);

export const requestSchemas = {
  GetQueuesQuery: getQueuesQuerySchema,
  GetJobSchedulersQuery: getJobSchedulersQuerySchema,
  GetJobFlowQuery: getJobFlowQuerySchema,
  GetMetricsHistoryQuery: getMetricsHistoryQuerySchema,
  GetMetricsLatencyQuery: getMetricsLatencyQuerySchema,
  AddJobBody: addJobBodySchema,
  UpdateJobDataBody: updateJobDataBodySchema,
  ChangeJobDelayBody: changeJobDelayBodySchema,
  ChangeJobPriorityBody: changeJobPriorityBodySchema,
  SetGlobalConcurrencyBody: setGlobalConcurrencyBodySchema,
  SetRateLimitBody: setRateLimitBodySchema,
  ObliterateQueueBody: obliterateQueueBodySchema,
  UpdateJobSchedulerBody: updateJobSchedulerBodySchema,
  PurgeMetricsHistoryBody: purgeMetricsHistoryBodySchema,
};

export type RequestSchemaName = keyof typeof requestSchemas;

type Schemas = typeof requestSchemas;

export type RequestSchemas = { [K in keyof Schemas]: v.InferOutput<Schemas[K]> };

export type RequestInputs = { [K in keyof Schemas]: v.InferInput<Schemas[K]> };

export type GetQueuesQuery = RequestSchemas['GetQueuesQuery'];
export type GetJobSchedulersQuery = RequestSchemas['GetJobSchedulersQuery'];
export type GetJobFlowQuery = RequestSchemas['GetJobFlowQuery'];
export type GetMetricsHistoryQuery = RequestSchemas['GetMetricsHistoryQuery'];
export type GetMetricsLatencyQuery = RequestSchemas['GetMetricsLatencyQuery'];
export type AddJobBody = RequestSchemas['AddJobBody'];
export type UpdateJobDataBody = RequestSchemas['UpdateJobDataBody'];
export type ChangeJobDelayBody = RequestSchemas['ChangeJobDelayBody'];
export type ChangeJobPriorityBody = RequestSchemas['ChangeJobPriorityBody'];
export type SetGlobalConcurrencyBody = RequestSchemas['SetGlobalConcurrencyBody'];
export type SetRateLimitBody = RequestSchemas['SetRateLimitBody'];
export type ObliterateQueueBody = RequestSchemas['ObliterateQueueBody'];
export type UpdateJobSchedulerBody = RequestSchemas['UpdateJobSchedulerBody'];
export type PurgeMetricsHistoryBody = RequestSchemas['PurgeMetricsHistoryBody'];
