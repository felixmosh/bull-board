import { RedisInfo } from 'redis-info';
import { STATUSES } from '../src/constants/statuses';
import { BaseAdapter } from '../src/queueAdapters/base';

export type JobCleanStatus = 'completed' | 'wait' | 'active' | 'delayed' | 'failed';

export type JobRetryStatus = 'completed' | 'failed';

type Library = 'bull' | 'bullmq';

type Values<T> = T[keyof T];
type BullMQStatuses = Values<typeof STATUSES>;
type BullStatuses = Exclude<BullMQStatuses, 'prioritized' | 'waiting-children' | 'scheduler'>;

export type Status<Lib extends Library = 'bullmq'> = Lib extends 'bullmq'
  ? BullMQStatuses
  : Lib extends 'bull'
  ? BullStatuses
  : never;

export type JobStatus<Lib extends Library = 'bullmq'> = Lib extends 'bullmq'
  ? Exclude<BullMQStatuses, 'latest' | 'scheduler'>
  : Lib extends 'bull'
  ? Exclude<BullStatuses, 'latest'>
  : never;

export type JobCounts = Record<Status, number>;

export interface QueueAdapterOptions {
  readOnlyMode: boolean;
  allowRetries: boolean;
  prefix: string;
  description: string;
}

export type BullBoardQueues = Map<string, BaseAdapter>;

export interface QueueJob {
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

export interface QueueJobScheduler {
  toJSON(): QueueJobJson;
}

export interface QueueJobJson {
  // add properties as needed from real Bull/BullMQ jobs
  id?: string | undefined | number | null;
  name: string;
  // eslint-disable-next-line @typescript-eslint/ban-types
  progress: number | object;
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
}

export interface QueueJobSchedulerJson {
  key: string;
  name: string;
  next: number;
  endDate: number | null;
  tz: string | null;
  cron: string | null;
  every: string | null;
  limit: number | null;
  count: number | null;
  jobId: string | null;
  prevMillis: number | null;
  offset: number | null;
}

export interface QueueJobOptions {
  delay?: number;
  attempts?: number;
}

export interface RedisStats {
  version: string;
  mode: RedisInfo['redis_mode'];
  port: number;
  os: string;
  uptime: number;
  memory: {
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
}

export interface AppJobScheduler {
  jobSchedulerId: string;
  repeatOpts: RepeatOptions;
  jobTemplate: JobTemplate;
}

export interface RepeatableJob {
  endDate: number | null;
  every?: string | null;
  id?: string | null;
  key: string;
  name: string;
  next?: number;
  pattern: string | null;
  tz: string | null;
}

export interface RepeatOptions {
  pattern?: string;
  key?: string;
  limit?: number;
  every?: number;
  immediately?: boolean;
  count?: number;
  prevMillis?: number;
  offset?: number;
  jobId?: string;
}

export interface JobTemplate {
  name: string;
  data: object;
  options: RepeatableJobOptions;
}

export interface RepeatableJobOptions {}

export type QueueType = 'bull' | 'bullmq';

export interface AppQueue {
  name: string;
  description?: string;
  counts: Record<Status, number>;
  jobs: AppJob[];
  jobSchedulers: RepeatableJob[];
  statuses: Status[];
  pagination: Pagination;
  readOnlyMode: boolean;
  allowRetries: boolean;
  allowCompletedRetries: boolean;
  isPaused: boolean;
  type: QueueType;
}

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch';
export type HTTPStatus = 200 | 204 | 404 | 405 | 500;

export interface BullBoardRequest {
  queues: BullBoardQueues;
  query: Record<string, any>;
  params: Record<string, any>;
  body: Record<string, any>;
}

export type ControllerHandlerReturnType = {
  status?: HTTPStatus;
  body: string | Record<string, any>;
};

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

export type FormatterField = 'data' | 'returnValue' | 'name';

export type BoardOptions = {
  uiBasePath?: string;
  uiConfig: UIConfig;
};

export type IMiscLink = {
  text: string;
  url: string;
};

export type UIConfig = Partial<{
  boardTitle: string;
  boardLogo: { path: string; width?: number | string; height?: number | string };
  miscLinks: Array<IMiscLink>;
  favIcon: FavIcon;
  locale: { lng?: string };
  dateFormats?: DateFormats;
  pollingInterval?: Partial<{
    showSetting: boolean;
    forceInterval: number;
  }>;
}>;

export type FavIcon = {
  default: string;
  alternative: string;
};

export type DateFormats = {
  /**
   * When timestamp is in same day (today)
   *
   * @example `hh:mm:ss`
   * @see https://date-fns.org/v3.6.0/docs/format
   */
  short?: string;

  /**
   * When timestamp is in same year
   *
   * @example `MM-dd hh:mm:ss`
   * @see https://date-fns.org/v3.6.0/docs/format
   */
  common?: string;

  /**
   * @example `yyyy-MM-dd hh:mm:ss`
   * @see https://date-fns.org/v3.6.0/docs/format
   */
  full?: string;
};
