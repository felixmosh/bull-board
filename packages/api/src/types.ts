import type * as v from 'valibot';
import type { STATUSES } from './constants/statuses';
import type { BaseAdapter } from './queueAdapters/base';
import type * as schemas from './schemas';
import type { RequestSchemas } from './schemas/requests';
import type { ResponseSchemas } from './schemas/responses';

export type JobCleanStatus = 'completed' | 'wait' | 'active' | 'delayed' | 'failed';

export type JobRetryStatus = 'completed' | 'failed';

export type MetricsType = 'completed' | 'failed';

export type HookContext = {
  method: HTTPMethod;
  route: string;
  request: BullBoardRequest;
};

export type BeforeHookResult = {
  allow: boolean;
  status?: HTTPStatus;
  message?: string;
  errorKey?: ErrorTranslationKey;
} | void;

export type BeforeHook = (context: HookContext) => Promisify<BeforeHookResult>;
export type AfterHook = (
  context: HookContext,
  result: ControllerHandlerReturnType
) => Promisify<ControllerHandlerReturnType>;

export type BoardHooks = {
  before?: BeforeHook;
  after?: AfterHook;
};

/**
 * Metrics readable from history. Wider than MetricsType, which is also the argument to
 * BullMQ's own getMetrics and must stay limited to what BullMQ buffers.
 */
export type MetricsHistoryMetric = v.InferOutput<typeof schemas.metricsHistoryMetricSchema>;

export type MetricsLatencyMetric = v.InferOutput<typeof schemas.metricsLatencyMetricSchema>;

export type QueueMetrics = v.InferOutput<typeof schemas.queueMetricsSchema>;

export type MetricsHistoryGranularity = v.InferOutput<
  typeof schemas.metricsHistoryGranularitySchema
>;

/**
 * Granularity for latency queries only. `'range'` collapses the whole `from..to` span into a
 * single merged point -- percentiles do not average, so a range p95 has to be computed once
 * from the summed bucket vectors rather than combined from per-day points. Kept separate from
 * MetricsHistoryGranularity, which the counter path also uses and must stay `'hour' | 'day'`.
 */
export type MetricsLatencyGranularity = v.InferOutput<
  typeof schemas.metricsLatencyGranularitySchema
>;

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

export type MetricsLatencyPoint = v.InferOutput<typeof schemas.metricsLatencyPointSchema>;

export type MetricsHistoryPoint = v.InferOutput<typeof schemas.metricsHistoryPointSchema>;

export type MetricsHistoryTierUsage = v.InferOutput<typeof schemas.metricsHistoryTierUsageSchema>;

export type MetricsHistoryQueueUsage = v.InferOutput<typeof schemas.metricsHistoryQueueUsageSchema>;

export type MetricsHistoryUsage = v.InferOutput<typeof schemas.metricsHistoryUsageSchema>;

export interface MetricsHistoryPurgeOptions {
  queue?: string;
  /** ISO `YYYY-MM-DD`. Drops days strictly before it; omit to drop everything in scope. */
  before?: string;
}

export type MetricsHistoryPurgeResult = v.InferOutput<
  typeof schemas.metricsHistoryPurgeResultSchema
>;

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

export type JobState = v.InferOutput<typeof schemas.jobStateSchema>;

export type JobCounts = v.InferOutput<typeof schemas.jobCountsSchema>;

export type ExternalJobUrl = v.InferOutput<typeof schemas.externalJobUrlSchema>;

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

  getState(): Promise<JobState>;

  update?(jobData: Record<string, any>): Promise<void>;

  updateData?(jobData: Record<string, any>): Promise<void>;

  changeDelay?(delay: number): Promise<void>;

  changePriority?(opts: { priority?: number; lifo?: boolean }): Promise<void>;

  removeUnprocessedChildren?(): Promise<void>;

  getDependenciesCount?(opts?: {
    processed?: boolean;
    unprocessed?: boolean;
    ignored?: boolean;
    failed?: boolean;
  }): Promise<{ processed?: number; unprocessed?: number; ignored?: number; failed?: number }>;
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
  priority?: number;
  attemptsStarted?: number;
  stalledCounter?: number;
  deduplicationId?: string;
  deferredFailure?: string;
}

export interface QueueJobOptions {
  delay?: number;
  attempts?: number;
}

export type QueueRateLimit = v.InferOutput<typeof schemas.queueRateLimitSchema>;

export type JobRetentionOption = v.InferOutput<typeof schemas.jobRetentionOptionSchema>;

export type QueueDefaultJobOptions = v.InferOutput<typeof schemas.queueDefaultJobOptionsSchema>;

/**
 * A single worker connection, as reported by Redis `CLIENT LIST`.
 * Bull and BullMQ both register their blocking connection under a queue specific
 * name, which is how a connection is attributed to a queue.
 */
export type QueueWorker = v.InferOutput<typeof schemas.queueWorkerSchema>;

export type RedisStats = v.InferOutput<typeof schemas.redisStatsSchema>;

export type AppJob = v.InferOutput<typeof schemas.appJobSchema>;

export type JobFlow = v.InferOutput<typeof schemas.jobFlowSchema>;

export type FlowNode = schemas.FlowNode;

export type FlowDependencies = v.InferOutput<typeof schemas.flowDependenciesSchema>;

/**
 * A job scheduler as the dashboard shows it. Fields the underlying library does not provide are
 * left out rather than faked: legacy Bull repeatables carry no template and no `lastRun`.
 */
export type AppJobScheduler = v.InferOutput<typeof schemas.appJobSchedulerSchema>;

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

export type QueueType = v.InferOutput<typeof schemas.queueTypeSchema>;

export interface ObliterateOptions {
  /**
   * Obliterate even while jobs are active. Both Bull and BullMQ refuse to obliterate a queue that
   * has active jobs unless this is set, since the workers processing them keep writing to keys the
   * obliterate is deleting.
   */
  force?: boolean;
}

export type AppQueue = v.InferOutput<typeof schemas.appQueueSchema>;

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch';
export type HTTPStatus = 200 | 204 | 400 | 403 | 404 | 405 | 409 | 500;

export interface BullBoardRequest<TQuery = Record<string, any>, TBody = Record<string, any>> {
  queues: BullBoardQueues;
  uiConfig: UIConfig;
  query: TQuery;
  params: Record<string, any>;
  body: TBody;
  headers: Record<string, string | undefined>;
}

export type ControllerHandlerReturnType<TBody = string | Record<string, any>> = {
  status?: HTTPStatus;
  body: TBody | ErrorResponseBody;
};

/**
 * Every translation key the API is allowed to put in an error body, listed in
 * `src/schemas/errorKeys.ts`. The client owns the wording, so adding an entry there means adding
 * it to `en-US/messages.json` too: the UI resolves these keys through a `t()` typed against that
 * file, so a key it does not know fails the build.
 */
export type ErrorTranslationKey = schemas.ErrorTranslationKey;

/** A translation key plus the values it interpolates, rendered by whoever displays it. */
export type TranslatableMessage = v.InferOutput<typeof schemas.translatableMessageSchema>;

/**
 * Text meant for a person. Anything the API can phrase itself is a translation key; a plain
 * string is the escape hatch for text that only exists at runtime, such as the message carried
 * by an error thrown from the queue library, which has no key to give.
 */
export type ErrorMessage = string | TranslatableMessage;

export type ErrorResponseBody = v.InferOutput<typeof schemas.errorResponseBodySchema>;

export type ViewHandlerReturnType = {
  name: string;
  params: Record<string, string>;
};

export type Promisify<T> = T | Promise<T>;

export interface RouteSpec<TResponse extends keyof ResponseSchemas = keyof ResponseSchemas> {
  summary: string;
  response: TResponse;
  body?: keyof RequestSchemas;
  query?: keyof RequestSchemas;
  successStatus?: HTTPStatus;
  availableWhen?: string;
}

export interface AppControllerRoute<
  TResponse extends keyof ResponseSchemas = keyof ResponseSchemas,
  TQuery = Record<string, any>,
  TBody = Record<string, any>,
> {
  method: HTTPMethod | HTTPMethod[];
  route: string | string[];
  spec: RouteSpec<TResponse>;

  handler(
    request?: BullBoardRequest<TQuery, TBody>
  ): Promisify<ControllerHandlerReturnType<ResponseSchemas[TResponse]>>;
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

export type Pagination = v.InferOutput<typeof schemas.paginationSchema>;

export type FormatterField = 'data' | 'returnValue' | 'name' | 'progress';

export type BoardOptions = {
  uiBasePath?: string;
  uiConfig?: UIConfig;
  historyProvider?: MetricsHistoryProvider;
  handlerHooks?: BoardHooks;
};

export type IMiscLink = {
  text: string;
  url: string;
  icon?: string;
};

export type JobDetailsTab = 'Data' | 'Progress' | 'Options' | 'Logs' | 'Error' | 'Timeline';

/**
 * Design-token names the UI exposes for whitelabel theming. Values are plain CSS
 * values applied as `--<name>` custom properties. Naming follows the shadcn theme
 * contract, so shadcn-compatible theme generators produce valid palettes.
 */
export type ThemeTokenName =
  | 'background'
  | 'foreground'
  | 'card'
  | 'card-foreground'
  | 'popover'
  | 'popover-foreground'
  | 'primary'
  | 'primary-foreground'
  | 'secondary'
  | 'secondary-foreground'
  | 'muted'
  | 'muted-foreground'
  | 'accent'
  | 'accent-foreground'
  | 'state-hover'
  | 'state-selected'
  | 'state-selected-hover'
  | 'state-selected-foreground'
  | 'destructive'
  | 'destructive-foreground'
  | 'border'
  | 'input'
  | 'ring'
  | 'radius'
  | 'shadow-popover'
  | 'shadow-ring'
  | 'shadow-control'
  | 'overlay'
  | 'font-sans'
  | 'font-mono'
  | 'sidebar'
  | 'sidebar-foreground'
  | 'sidebar-primary'
  | 'sidebar-primary-foreground'
  | 'sidebar-accent'
  | 'sidebar-accent-foreground'
  | 'sidebar-state-hover'
  | 'sidebar-state-selected'
  | 'sidebar-state-selected-hover'
  | 'sidebar-state-selected-foreground'
  | 'sidebar-border'
  | 'sidebar-ring'
  | `chart-${1 | 2 | 3 | 4 | 5}`
  | `status-${
      | 'failed'
      | 'completed'
      | 'waiting'
      | 'waiting-children'
      | 'prioritized'
      | 'active'
      | 'delayed'
      | 'paused'}`;

export type UITheme = {
  /** Token overrides applied to the light theme. */
  light?: Partial<Record<ThemeTokenName, string>>;
  /** Token overrides applied to the dark theme. */
  dark?: Partial<Record<ThemeTokenName, string>>;
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
  jobDetails?: { defaultTab?: JobDetailsTab };
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
  /** Whitelabel theming: CSS design-token overrides, keyed per color scheme. */
  theme?: UITheme;
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
