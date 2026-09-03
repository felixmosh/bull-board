import type { QueueAdapterOptions, UIConfig } from '@bull-board/api/typings/app';
import type { Retention } from '@bull-board/metrics';

export interface FileHistoryConfig {
  enabled?: boolean;
  /** Write snapshots from this process. Defaults to true unless the board is read-only. */
  record?: boolean;
  retentionDays?: number;
  retention?: Partial<Retention>;
  latency?: boolean;
  snapshotIntervalMs?: number;
}

export interface HistoryConfig {
  record: boolean;
  retentionDays?: number;
  retention?: Partial<Retention>;
  latency: boolean;
  snapshotIntervalMs?: number;
}

export interface FileConfig {
  redis?: string;
  port?: number;
  host?: string;
  prefix?: string | string[];
  queues?: string[] | Record<string, Partial<QueueAdapterOptions>>;
  scanInterval?: number;
  basePath?: string;
  readOnly?: boolean;
  user?: string;
  password?: string;
  open?: boolean;
  browser?: string;
  uiConfig?: UIConfig;
  noRetry?: boolean;
  history?: boolean | FileHistoryConfig;
}

export interface CliConfig {
  redisUrl: string;
  port: number;
  host: string;
  prefixes: string[];
  queueNames: string[] | null;
  scanInterval: number;
  basePath: string;
  readOnly: boolean;
  auth: { user: string; password: string } | null;
  open: boolean;
  browser?: string;
  uiConfig: UIConfig;
  queueOptions: Record<string, Partial<QueueAdapterOptions>>;
  noRetry: boolean;
  history: HistoryConfig | null;
}
