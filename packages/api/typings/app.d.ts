import type { RedisInfo } from 'redis-info';
import type { BaseAdapter } from '../baseAdapter';
import type { DATASTORES } from '../dist/constants/datastores';
import type { STATUSES } from '../dist/constants/statuses';

export type JobCleanStatus = 'completed' | 'wait' | 'active' | 'delayed' | 'failed';

export type JobRetryStatus = 'completed' | 'failed';

export type MetricsType = 'completed' | 'failed';

/**
 * Metrics readable from history. Wider than MetricsType, which is also the argument to
 * BullMQ's own getMetrics and must stay limited to what BullMQ buffers.
 */
export type MetricsHistoryMetric = MetricsType | 'queueage';

export type MetricsLatencyMetric = 'runtime' | 'waittime';

export interface QueueMetrics {
  meta: {
    count: number;
    prevTS: number;
    prevCount: number;
  };
  data: number[];
  count: number;
}

export type MetricsHistoryGranularity = 'hour' | 'day';

/**
 * Granularity for latency queries only. `'range'` collapses the whole `from..to` span into a
 * single merged point -- percentiles do not average, so a range p95 has to be computed once
 * from the summed bucket vectors rather than combined from per-day points. Kept separate from
 * MetricsHistoryGranularity, which the counter path also uses and must stay `'hour' | 'day'`.
 */
export type MetricsLatencyGranularity = MetricsHistoryGranularity | 'range';

export interface MetricsHistoryQuery {
  /** Queue name (namespaced, as returned by adapter.getName()). Omit for the cross-queue global rollup. */
  queue?: string;
  metric: MetricsHistoryMetric;
  /** Inclusive lower bound, epoch ms. */
  from: number;
  /** Inclusive upper bound, epoch ms. */
  to: number;
  granularity: MetricsHistoryGranularity;
}

export interface MetricsLatencyQuery {
  /** Queue name (namespaced, as returned by adapter.getName()). Omit for the global rollup. */
  queue?: string;
  metric: MetricsLatencyMetric;
  /** Inclusive lower bound, epoch ms. */
  from: number;
  /** Inclusive upper bound, epoch ms. */
  to: number;
  granularity: MetricsLatencyGranularity;
  /** Requested percentiles, 0-100, matching the keys of `values`. */
  percentiles: number[];
}

export interface MetricsLatencyPoint {
  ts: number;
  /** Samples behind this point, so low-confidence points can be dimmed rather than drawn. */
  count: number;
  /** Percentile to milliseconds, keyed by the stringified percentile. */
  values: Record<string, number>;
}

export interface MetricsHistoryPoint {
  /** Bucket start, epoch ms (UTC-aligned to the granularity). */
  ts: number;
  value: number;
}

export interface MetricsHistoryTierUsage {
  keys: number;
  bytes: number;
}

export interface MetricsHistoryQueueUsage {
  queue: string;
  keys: number;
  bytes: number;
  minutes: number;
  days: string[];
  tiers: Record<'minute' | 'hour' | 'day', MetricsHistoryTierUsage>;
}

export interface MetricsHistoryUsage {
  keys: number;
  bytes: number;
  minutes: number;
  oldestDay: string | null;
  newestDay: string | null;
  tiers: Record<'minute' | 'hour' | 'day', MetricsHistoryTierUsage>;
  queues: MetricsHistoryQueueUsage[];
}

export interface MetricsHistoryPurgeOptions {
  queue?: string;
  /** ISO `YYYY-MM-DD`. Drops days strictly before it; omit to drop everything in scope. */
  before?: string;
}

export interface MetricsHistoryPurgeResult {
  keysDeleted: number;
  fieldsDeleted: number;
}

/**
 * Seam the core uses to serve long-retention metrics history.
 * The concrete implementation lives in the opt-in @bull-board/metrics package.
 * The core never stores anything; it only calls this interface.
 *
 * `getUsage` and `purge` are optional. Their routes are registered only when a provider
 * implements them, so a custom read-only provider stays valid and the UI never offers a
 * storage panel that has nothing behind it.
 */
export interface MetricsHistoryProvider {
  getHistory(query: MetricsHistoryQuery): Promise<MetricsHistoryPoint[]>;
  getLatency?(query: MetricsLatencyQuery): Promise<MetricsLatencyPoint[]>;
  getUsage?(): Promise<MetricsHistoryUsage>;
  purge?(options: MetricsHistoryPurgeOptions): Promise<MetricsHistoryPurgeResult>;
}

type Library = 'bull' | 'bullmq';

type BullMQStatuses = STATUSES;
type BullStatuses = Exclude<BullMQStatuses, 'prioritized' | 'waiting-children'>;

export type Status<Lib extends Library = 'bullmq'> = Lib extends 'bullmq'
  ? BullMQStatuses
  : Lib extends 'bull'
    ? BullStatuses
    : never;

export type JobStatus<Lib extends Library = 'bullmq'> = Lib extends 'bullmq'
  ? Exclude<BullMQStatuses, 'latest'>
  : Lib extends 'bull'
    ? Exclude<BullStatuses, 'latest'>
    : never;

export type JobCounts = Record<Status, number>;
export type ExternalJobUrl = {
  displayText?: string;
  href: string;
};

export interface QueueAdapterOptions {
  readOnlyMode: boolean;
  allowRetries: boolean;
  prefix: string;
  description: string;
  displayName: string;
  delimiter: string;
  externalJobUrl?: (job: QueueJobJson) => ExternalJobUrl;
  jobDataSchema?: Record<string, any>;
}

export type BullBoardQueues = Map<string, BaseAdapter>;

export interface QueueJob {
  repeatJobKey?: string;

  opts: {
    delay?: number | undefined;
  };

  promote(): Promise<void>;

  remove(): Promise<void>;

  retry(state?: JobRetryStatus): Promise<void>;

  toJSON(): QueueJobJson;

  getState(): Promise<Status | 'stuck' | 'waiting-children' | 'prioritized' | 'unknown'>;

  update?(jobData: Record<string, any>): Promise<void>;

  updateData?(jobData: Record<string, any>): Promise<void>;
}

export interface QueueJobJson {
  // add properties as needed from real Bull/BullMQ jobs
  id?: string | undefined | number | null;
  name: string;
  progress: string | boolean | number | object;
  attemptsMade: number;
  finishedOn?: number | null;
  processedOn?: number | null;
  processedBy?: string | null;
  delay?: number;
  timestamp: number;
  failedReason: string;
  stacktrace: string[] | null;
  data: any;
  returnvalue: any;
  opts: any;
  parentKey?: string;
  repeatJobKey?: string;
}

export interface QueueJobOptions {
  delay?: number;
  attempts?: number;
}

export type JobRetentionOption = boolean | number | { age?: number; count?: number };

export interface QueueDefaultJobOptions {
  attempts?: number;
  delay?: number;
  priority?: number;
  lifo?: boolean;
  backoff?: number | { type: string; delay?: number };
  removeOnComplete?: JobRetentionOption;
  removeOnFail?: JobRetentionOption;
  [option: string]: unknown;
}

/**
 * A single worker connection, as reported by Redis `CLIENT LIST`.
 * Bull and BullMQ both register their blocking connection under a queue specific
 * name, which is how a connection is attributed to a queue.
 */
export interface QueueWorker {
  /** Redis client id of the worker connection. */
  id: string;
  /** The name the worker was created with, or null for an unnamed worker. */
  name: string | null;
  /** `ip:port` the worker connects from. */
  addr: string;
  /** Seconds since the connection was opened. */
  age: number;
}

export interface RedisStats {
  /** Absent on responses from older servers, which could only ever be Redis. */
  backend?: DATASTORES;
  version: string;
  mode?: RedisInfo['redis_mode'];
  port: number;
  os?: string;
  uptime: number;
  /** Redis only. PostgreSQL reports disk, which is not the same thing and is not shown. */
  memory?: {
    total: number;
    used: number;
    fragmentationRatio: number;
    peak: number;
  };
  clients: {
    connected: number;
    blocked: number;
  };
}

export interface AppJob {
  id: QueueJobJson['id'];
  name: QueueJobJson['name'];
  timestamp: QueueJobJson['timestamp'];
  processedOn?: QueueJobJson['processedOn'];
  processedBy?: QueueJobJson['processedBy'];
  finishedOn?: QueueJobJson['finishedOn'];
  progress: QueueJobJson['progress'];
  attempts: QueueJobJson['attemptsMade'];
  failedReason: QueueJobJson['failedReason'];
  stacktrace: string[];
  delay: number | undefined;
  opts: QueueJobJson['opts'];
  data: QueueJobJson['data'];
  returnValue: QueueJobJson['returnvalue'];
  isFailed: boolean;
  externalUrl?: {
    displayText?: string;
    href: string;
  };
  groupId?: string | number;
}

export interface JobFlow {
  nodeId: string;
  isFlowNode: boolean;
  flowRoot: FlowNode | null;
}

export interface FlowNode {
  id: string;
  name: string;
  state: string;
  progress: string | boolean | number | object;
  queueName: string;
  children: FlowNode[];
}

/**
 * A job scheduler as the dashboard shows it. Fields the underlying library does not provide are
 * left out rather than faked: legacy Bull repeatables carry no template and no `lastRun`.
 */
export interface AppJobScheduler {
  /** Scheduler id in BullMQ, repeatable key in Bull. Unique within its queue. */
  id: string;
  queueName: string;
  /** Name of the job the scheduler produces. */
  name: string;
  pattern?: string;
  every?: number;
  tz?: string;
  limit?: number;
  startDate?: number;
  endDate?: number;
  /** When the next run fires. */
  next?: number;
  /** The delayed job the next run will be, so the dashboard can link straight to it. */
  nextRunJobId?: string;
  /**
   * When the previous run started, derived from the pending delayed job. Absent when the
   * scheduler has not run yet, when that job is gone, or on Bull, which cannot report it.
   */
  lastRun?: number;
  /**
   * The job the previous run was, when it can still be named and has not been trimmed away by
   * `removeOnComplete` and friends. Absent for cron schedules, whose previous fire time cannot
   * be worked out without parsing the pattern.
   */
  lastRunJobId?: string;
  iterationCount?: number;
  template?: {
    data?: any;
    opts?: Record<string, any>;
  };
}

/** The schedule of an existing scheduler, as an edit describes it. */
export interface JobSchedulerRepeatOptions {
  pattern?: string;
  every?: number;
  tz?: string;
  limit?: number;
  endDate?: number;
}

/** Why an update did not happen, so the handler can pick the status and the key. */
export type JobSchedulerUpdateResult = 'updated' | 'not-found' | 'invalid-schedule';

export type QueueType = 'bull' | 'bullmq';

export interface AppQueue {
  delimiter: string;
  name: string;
  displayName?: string;
  description?: string;
  counts: Record<Status, number>;
  jobs: AppJob[];
  statuses: Status[];
  pagination: Pagination;
  readOnlyMode: boolean;
  allowRetries: boolean;
  allowCompletedRetries: boolean;
  isPaused: boolean;
  type: QueueType;
  globalConcurrency: number | null;
  jobSchedulerCount: number;
  /**
   * Whether anything is currently consuming this queue. `null` means the question could not be
   * answered, which is not the same as nobody being there: the adapter may not implement it, the
   * Redis provider may block `CLIENT LIST`, or `showWorkers` may be off.
   */
  hasWorkers: boolean | null;
}

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch';
export type HTTPStatus = 200 | 204 | 400 | 403 | 404 | 405 | 409 | 500;

export interface BullBoardRequest {
  queues: BullBoardQueues;
  uiConfig: UIConfig;
  query: Record<string, any>;
  params: Record<string, any>;
  body: Record<string, any>;
  headers: Record<string, string | undefined>;
}

export type ControllerHandlerReturnType = {
  status?: HTTPStatus;
  body: string | Record<string, any>;
};

/**
 * Every translation key the API is allowed to put in an error body. The client owns the wording,
 * so adding an entry here means adding it to `en-US/messages.json` too: the UI resolves these
 * keys through a `t()` typed against that file, so a key it does not know fails the build.
 */
export type ErrorTranslationKey =
  | 'ERRORS.INTERNAL_SERVER_ERROR'
  | 'ERRORS.INVALID_BEFORE_DATE'
  | 'ERRORS.INVALID_CONCURRENCY'
  | 'ERRORS.INVALID_DATE_RANGE'
  | 'ERRORS.INVALID_GRANULARITY'
  | 'ERRORS.INVALID_METRIC'
  | 'ERRORS.INVALID_QUEUE'
  | 'ERRORS.INVALID_SCHEDULER_END_DATE'
  | 'ERRORS.INVALID_SCHEDULER_INTERVAL'
  | 'ERRORS.INVALID_SCHEDULER_LIMIT'
  | 'ERRORS.INVALID_SCHEDULER_PATTERN'
  | 'ERRORS.INVALID_SCHEDULER_SCHEDULE'
  | 'ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER'
  | 'ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER_DETAILS'
  | 'ERRORS.JOB_IS_ACTIVE'
  | 'ERRORS.JOB_IS_ACTIVE_DETAILS'
  | 'ERRORS.JOB_NOT_FOUND'
  | 'ERRORS.JOB_NOT_RETRIABLE'
  | 'ERRORS.JOB_SCHEDULER_EDIT_NOT_SUPPORTED'
  | 'ERRORS.JOB_SCHEDULER_NOT_FOUND'
  | 'ERRORS.QUEUE_NOT_FOUND'
  | 'ERRORS.QUEUE_NOT_PAUSED'
  | 'ERRORS.QUEUE_READ_ONLY'
  | 'ERRORS.REDIS_STATS_UNAVAILABLE'
  | 'ERRORS.STATUS_NOT_RETRIABLE'
  | 'ERRORS.WORKERS_DISABLED';

/** A translation key plus the values it interpolates, rendered by whoever displays it. */
export interface TranslatableMessage {
  key: ErrorTranslationKey;
  options?: Record<string, any>;
}

/**
 * Text meant for a person. Anything the API can phrase itself is a translation key; a plain
 * string is the escape hatch for text that only exists at runtime, such as the message carried
 * by an error thrown from the queue library, which has no key to give.
 */
export type ErrorMessage = string | TranslatableMessage;

export interface ErrorResponseBody {
  /** Headline of the failure. Always a key, so it can never be untranslatable English. */
  error: TranslatableMessage;
  /** Optional detail shown under the headline. */
  message?: ErrorMessage;
  /** Stable identifier for clients that branch on a specific failure rather than display it. */
  code?: string;
  details?: string;
}

export type ViewHandlerReturnType = {
  name: string;
  params: Record<string, string>;
};

export type Promisify<T> = T | Promise<T>;

export interface AppControllerRoute {
  method: HTTPMethod | HTTPMethod[];
  route: string | string[];

  handler(request?: BullBoardRequest): Promisify<ControllerHandlerReturnType>;
}

export interface AppViewRoute {
  method: HTTPMethod;
  route: string | string[];

  handler(params: { basePath: string; uiConfig: UIConfig }): ViewHandlerReturnType;
}

export type AppRouteDefs = {
  entryPoint: AppViewRoute;
  api: AppControllerRoute[];
};

export interface IServerAdapter {
  setQueues(bullBoardQueues: BullBoardQueues): IServerAdapter;

  setViewsPath(viewPath: string): IServerAdapter;

  setStaticPath(staticsRoute: string, staticsPath: string): IServerAdapter;

  setEntryRoute(route: AppViewRoute): IServerAdapter;

  setErrorHandler(handler: (error: Error) => ControllerHandlerReturnType): IServerAdapter;

  setApiRoutes(routes: AppControllerRoute[]): IServerAdapter;

  setUIConfig(config: UIConfig): IServerAdapter;
}

export interface Pagination {
  pageCount: number;
  range: {
    start: number;
    end: number;
  };
}

export type FormatterField = 'data' | 'returnValue' | 'name' | 'progress';

export type BoardOptions = {
  uiBasePath?: string;
  uiConfig?: UIConfig;
  historyProvider?: MetricsHistoryProvider;
};

export type IMiscLink = {
  text: string;
  url: string;
};

export type UIConfig = Partial<{
  boardTitle: string;
  boardLogo: { path: string; width?: number | string; height?: number | string };
  miscLinks: Array<IMiscLink>;
  /** Hide the header Docs icon that links to the bull-board documentation site. Default: false (shown). */
  hideDocsLink: boolean;
  queueSortOptions: Array<{ key: string; label: string }>;
  favIcon: FavIcon;
  locale: { lng?: string };
  dateFormats?: DateFormats;
  pollingInterval?: Partial<{
    showSetting: boolean;
    forceInterval: number;
  }>;
  menu?: { width?: string };
  overview?: { groupByDelimiter?: boolean };
  sortQueues?: boolean;
  hideRedisDetails?: boolean;
  showMetrics?: boolean;
  /**
   * Report the workers connected to each queue. Default: true.
   * Set to false to drop the per-queue `CLIENT LIST` the board otherwise runs on every poll.
   */
  showWorkers?: boolean;
  /** Set by createBullBoard when a historyProvider is configured. Enables the history range selector in the UI. */
  hasHistoryProvider?: boolean;
  /** Set by createBullBoard when the provider reports storage usage. Enables the storage panel. */
  hasHistoryUsage?: boolean;
  /** Set by createBullBoard when the provider can purge and the board is not read-only. */
  canPurgeHistory?: boolean;
  /** Set by createBullBoard when the provider reports latency percentiles. Enables the latency chart. */
  hasLatencyHistory?: boolean;
  environment?: {
    label: string;
    color: string;
    textColor?: string;
    fontSize?: string | number;
  };
}>;

export type FavIcon = {
  default: string;
  alternative: string;
};

export type DateFormats = {
  /**
   * When timestamp is in same day (today)
   *
   * @example `{ hour: 'numeric', minute: 'numeric', second: 'numeric' }`
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
   */
  short?: Intl.DateTimeFormatOptions;

  /**
   * When timestamp is in same year
   *
   * @example `{ month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }`
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
   */
  common?: Intl.DateTimeFormatOptions;

  /**
   * @example `{ year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }`
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
   */
  full?: Intl.DateTimeFormatOptions;
};
