export const DEFAULT_NAMESPACE = 'bull-board:metrics';
export const GLOBAL_QUEUE = '__global__';
/** Marks the hourly rollup key so it can't be mistaken for a minute-level day hash. */
export const HOUR_TIER = 'hour';

const MS_PER_MINUTE = 60000;
const MS_PER_DAY = 86400000;
const MINUTES_PER_HOUR = 60;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function msToDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function minuteToDay(minute: number): string {
  return msToDay(minute * MS_PER_MINUTE);
}

/** Absolute hour index, the hourly counterpart of the absolute minute index. */
export function minuteToHour(minute: number): number {
  return Math.floor(minute / MINUTES_PER_HOUR);
}

export function shiftDay(day: string, offsetDays: number): string {
  return msToDay(dayToStartMs(day) + offsetDays * MS_PER_DAY);
}

export function dayToStartMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function dayRange(fromMs: number, toMs: number): string[] {
  const days: string[] = [];
  let cursor = Date.UTC(
    new Date(fromMs).getUTCFullYear(),
    new Date(fromMs).getUTCMonth(),
    new Date(fromMs).getUTCDate()
  );
  const end = toMs;
  while (cursor <= end) {
    days.push(msToDay(cursor));
    cursor += MS_PER_DAY;
  }
  return days;
}

function hasHashTag(value: string): boolean {
  const open = value.indexOf('{');
  return open !== -1 && value.indexOf('}', open + 1) > open + 1;
}

function trimTrailingColons(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === ':') {
    end -= 1;
  }
  return value.slice(0, end);
}

// The braces are a Redis hash tag: one EVAL writes queue and `__global__` keys together.
export function resolveNamespace(prefix: string | undefined, clustered: boolean): string {
  const base = trimTrailingColons(prefix ?? DEFAULT_NAMESPACE) || DEFAULT_NAMESPACE;
  return clustered && !hasHashTag(base) ? `{${base}}` : base;
}

export interface MetricsKeys {
  namespace: string;
  day(queue: string, metric: string, day: string): string;
  hour(queue: string, metric: string, day: string): string;
  totals(queue: string, metric: string): string;
  lease(queue: string): string;
  watermark(queue: string): string;
  scanPattern: string;
}

export function metricsKeys(namespace: string): MetricsKeys {
  return {
    namespace,
    day: (queue, metric, day) => `${namespace}:${queue}:${metric}:${day}`,
    hour: (queue, metric, day) => `${namespace}:${queue}:${metric}:${HOUR_TIER}:${day}`,
    totals: (queue, metric) => `${namespace}:${queue}:${metric}:totals`,
    lease: (queue) => `${namespace}:${queue}:latency:lease`,
    watermark: (queue) => `${namespace}:${queue}:latency:watermark`,
    scanPattern: `${namespace}:*`,
  };
}
