import jsonata from 'jsonata';
import { SEARCH_SCAN_LIMIT } from '../constants/jobFilters';
import { BaseAdapter } from '../queueAdapters/base';
import type { AppJob, JobCounts, JobSearchResult, JobStatus, JobsOrder, QueueJob } from '../types';

const SCAN_BATCH_SIZE = 200;

/** Thrown for a search that is not a valid JSONata expression, so the handler can answer 400. */
export class InvalidSearchExpressionError extends Error {}

export type SearchExpression = jsonata.Expression;

export function compileSearch(search: string): SearchExpression {
  try {
    return jsonata(search);
  } catch (error) {
    throw new InvalidSearchExpressionError((error as Error).message);
  }
}

/**
 * The object the expression is evaluated against: the job as the queue library stores it, so
 * `data.payload.organizationId = 77` reads the job's own data. `name`, `data` and `returnvalue`
 * go through the queue's formatters first, so a field a formatter masks cannot be searched.
 */
function searchTarget(job: QueueJob, formatted: AppJob) {
  return {
    ...job.toJSON(),
    name: formatted.name,
    data: formatted.data,
    returnvalue: formatted.returnValue,
    progress: formatted.progress,
  };
}

/** Same rule as Bull Monitor's search: any truthy result matches, an empty object or array does not. */
export async function matchesSearch(
  expression: SearchExpression,
  job: QueueJob,
  formatted: AppJob
): Promise<boolean> {
  try {
    const result = await expression.evaluate(searchTarget(job, formatted));
    if (!result) return false;
    if (Array.isArray(result)) return result.length > 0;
    return typeof result === 'object' ? Object.keys(result).length > 0 : true;
  } catch {
    // A job the expression cannot evaluate (a type mismatch, a missing path) does not match.
    return false;
  }
}

/**
 * Bull and BullMQ have no index over job contents, so a search reads the status lists in
 * batches and keeps the jobs that match, up to SEARCH_SCAN_LIMIT jobs.
 */
export async function searchJobs(
  queue: BaseAdapter,
  statuses: JobStatus[],
  counts: JobCounts,
  expression: SearchExpression,
  order: JobsOrder,
  format: (job: QueueJob) => AppJob
): Promise<{ jobs: AppJob[]; result: JobSearchResult }> {
  const asc = order === 'asc';
  const matches: AppJob[] = [];
  let scanned = 0;
  let truncated = false;

  for (const status of statuses) {
    const total = counts[status] ?? 0;
    let start = 0;
    while (start < total && scanned < SEARCH_SCAN_LIMIT) {
      const size = Math.min(SCAN_BATCH_SIZE, SEARCH_SCAN_LIMIT - scanned, total - start);
      const batch = await queue.getJobs([status], start, start + size - 1, asc);
      scanned += size;
      start += size;
      for (const job of batch.filter(Boolean)) {
        const formatted = format(job);
        if (await matchesSearch(expression, job, formatted)) {
          matches.push(formatted);
        }
      }
    }
    if (start < total) {
      truncated = true;
      break;
    }
  }

  // Each status list comes back in order on its own; across several, interleave them by age.
  if (statuses.length > 1) {
    matches.sort((a, b) =>
      asc ? (a.timestamp ?? 0) - (b.timestamp ?? 0) : (b.timestamp ?? 0) - (a.timestamp ?? 0)
    );
  }

  return { jobs: matches, result: { matched: matches.length, scanned, truncated } };
}
