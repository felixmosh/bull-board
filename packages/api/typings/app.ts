import { RedisInfo } from 'redis-info';
import { STATUSES } from '../src/constants/statuses';
import { BaseAdapter } from '../src/queueAdapters/base';

export type JobCleanStatus = 'completed' | 'wait' | 'active' | 'delayed' | 'failed';

export type JobRetryStatus = 'completed' | 'failed';

export type Status = keyof typeof STATUSES;

export type JobStatus = keyof Omit<typeof STATUSES, 'latest'>;

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
  delay?: number;
  timestamp: number;
  failedReason: string;
  stacktrace: string[] | null;
  data: any;
  returnvalue: any;
  opts: any;
  parentKey?: string;
}

export interface RedisStats {
  version: string;
  mode: RedisInfo['redis_mode'];
  port: number;
  os: string;
  uptime: string;
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

export interface AppQueue {
  name: string;
  description?: string;
  counts: Record<Status, number>;
  jobs: AppJob[];
  pagination: Pagination;
  readOnlyMode: boolean;
  allowRetries: boolean;
  allowCompletedRetries: boolean;
  isPaused: boolean;
}

export type HTTPMethod = 'get' | 'post' | 'put';
export type HTTPStatus = 200 | 204 | 404 | 405 | 500;

export interface BullBoardRequest {
  queues: BullBoardQueues;
  query: Record<string, any>;
  params: Record<string, any>;
}

export type ControllerHandlerReturnType = {
  status?: HTTPStatus;
  body: string | Record<string, any>;
};

export type ViewHandlerReturnType = {
  name: string;
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

  handler(request?: BullBoardRequest): ViewHandlerReturnType;
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
}>;
