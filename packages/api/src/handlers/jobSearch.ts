import { BaseAdapter } from '../queueAdapters/base';
import type {
  AppJob,
  JobCounts,
  JobSearchField,
  JobSearchMatch,
  JobSearchResult,
  JobStatus,
  QueueJob,
} from '../types';

export interface JobSearchQuery {
  search: string;
  searchIn: JobSearchField;
  match: JobSearchMatch;
  caseSensitive: boolean;
  scanLimit: number;
}

const SCAN_BATCH_SIZE = 200;

/** Thrown for a `regex` search that does not compile, so the handler can answer 400. */
export class InvalidSearchPatternError extends Error {}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Redis `MATCH` semantics: `*`, `?`, `[abc]`, `[^a]`, `[a-z]`, and `\` to escape. */
function globToRegExpSource(pattern: string) {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\' && i + 1 < pattern.length) {
      source += escapeRegExp(pattern[++i]);
    } else if (char === '*') {
      source += '.*';
    } else if (char === '?') {
      source += '.';
    } else if (char === '[') {
      const close = pattern.indexOf(']', i + 2);
      if (close === -1) {
        source += '\\[';
      } else {
        const body = pattern.slice(i + 1, close).replace(/\\/g, '\\\\');
        source += `[${body.startsWith('^') ? `^${body.slice(1)}` : body}]`;
        i = close;
      }
    } else {
      source += escapeRegExp(char);
    }
  }
  return `^${source}$`;
}

export function buildMatcher(
  search: string,
  match: JobSearchMatch,
  caseSensitive: boolean
): (value: string) => boolean {
  if (match === 'contains' || match === 'exact') {
    const needle = caseSensitive ? search : search.toLowerCase();
    return match === 'exact'
      ? (value) => (caseSensitive ? value : value.toLowerCase()) === needle
      : (value) => (caseSensitive ? value : value.toLowerCase()).includes(needle);
  }

  let pattern: RegExp;
  try {
    pattern = new RegExp(
      match === 'glob' ? globToRegExpSource(search) : search,
      caseSensitive ? 's' : 'is'
    );
  } catch (error) {
    throw new InvalidSearchPatternError((error as Error).message);
  }
  return (value) => pattern.test(value);
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

/** Every key path and leaf value of a JSON value, e.g. `user.email` -> `a@b.c`. */
function collectEntries(value: unknown, path: string, keys: string[], values: string[], depth = 0) {
  if (depth > 32) {
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${childKey}` : childKey;
      keys.push(childPath);
      if (childPath !== childKey) {
        keys.push(childKey);
      }
      collectEntries(child, childPath, keys, values, depth + 1);
    }
    return;
  }
  values.push(value === null || value === undefined ? 'null' : String(value));
}

function candidates(job: AppJob, searchIn: JobSearchField): string[] {
  const error = () => [job.failedReason ?? '', ...(job.stacktrace ?? [])];

  switch (searchIn) {
    case 'id':
      return [`${job.id ?? ''}`];
    case 'name':
      return [job.name];
    case 'data':
      return [stringify(job.data)];
    case 'dataKey': {
      const keys: string[] = [];
      collectEntries(job.data, '', keys, []);
      return keys;
    }
    case 'dataValue': {
      const values: string[] = [];
      collectEntries(job.data, '', [], values);
      return values;
    }
    case 'error':
      return error();
    case 'returnValue':
      return [stringify(job.returnValue)];
    case 'opts':
      return [stringify(job.opts)];
    case 'all':
    default:
      return [
        `${job.id ?? ''}`,
        job.name,
        stringify(job.data),
        ...error(),
        stringify(job.returnValue),
      ];
  }
}

export function jobMatches(
  job: AppJob,
  searchIn: JobSearchField,
  matcher: (value: string) => boolean
) {
  return candidates(job, searchIn).some((value) => value !== '' && matcher(value));
}

/**
 * Scans the queue's status lists, newest first, and keeps the jobs that match. Bull and BullMQ
 * have no secondary index over job contents, so this reads up to `scanLimit` jobs, the same
 * trade-off a Redis client makes when it SCANs with a MATCH pattern.
 */
export async function searchJobs(
  queue: BaseAdapter,
  statuses: JobStatus[],
  counts: JobCounts,
  query: JobSearchQuery,
  format: (job: QueueJob) => AppJob
): Promise<{ jobs: AppJob[]; result: JobSearchResult }> {
  const matcher = buildMatcher(query.search, query.match, query.caseSensitive);
  const matches: AppJob[] = [];
  const seen = new Set<string>();
  let scanned = 0;
  let truncated = false;

  const keep = (job: AppJob) => {
    const id = `${job.id}`;
    if (!seen.has(id) && jobMatches(job, query.searchIn, matcher)) {
      seen.add(id);
      matches.push(job);
    }
  };

  // An id is unique, so an exact id lookup is one read instead of a scan.
  if (query.searchIn === 'id' && query.match === 'exact') {
    const job = await queue.getJob(query.search).catch(() => null);
    if (job) {
      scanned = 1;
      const state = await job.getState().catch(() => null);
      if (state && (statuses as string[]).includes(state)) {
        keep(format(job));
      }
    }
    return {
      jobs: matches,
      result: { scanned, matched: matches.length, scanLimit: query.scanLimit, truncated },
    };
  }

  for (const status of statuses) {
    const total = counts[status] ?? 0;
    let start = 0;
    while (start < total && scanned < query.scanLimit) {
      const size = Math.min(SCAN_BATCH_SIZE, query.scanLimit - scanned, total - start);
      const batch = await queue.getJobs([status], start, start + size - 1);
      scanned += size;
      start += size;
      batch.filter(Boolean).forEach((job) => keep(format(job)));
    }
    if (start < total) {
      truncated = true;
      break;
    }
  }

  // Each status list is newest first on its own; across several, interleave them by age.
  if (statuses.length > 1) {
    matches.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  }

  return {
    jobs: matches,
    result: { scanned, matched: matches.length, scanLimit: query.scanLimit, truncated },
  };
}
