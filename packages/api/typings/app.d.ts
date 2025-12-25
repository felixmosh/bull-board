import type { RedisInfo } from 'redis-info';
import type { STATUSES } from '../dist/constants/statuses';
import type { BaseAdapter } from '../baseAdapter';

export type JobCleanStatus = 'completed' | 'wait' | 'active' | 'delayed' | 'failed';

export type JobRetryStatus = 'completed' | 'failed';

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
  externalUrl?: {
    displayText?: string;
    href: string;
  };
}

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
}

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch';
export type HTTPStatus = 200 | 204 | 400 | 404 | 405 | 500;

export interface BullBoardRequest {
  queues: BullBoardQueues;
  query: Record<string, any>;
  params: Record<string, any>;
  body: Record<string, any>;
  headers: Record<string, string | undefined>;
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
  uiConfig?: UIConfig;
};

export type IMiscLink = {
  text: string;
  url: string;
};

export type UIConfig = Partial<{
  boardTitle: string;
  boardLogo: { path: string; width?: number | string; height?: number | string };
  miscLinks: Array<IMiscLink>;
  queueSortOptions: Array<{ key: string; label: string }>;
  favIcon: FavIcon;
  locale: { lng?: string };
  dateFormats?: DateFormats;
  pollingInterval?: Partial<{
    showSetting: boolean;
    forceInterval: number;
  }>;
  menu?: { width?: string };
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
