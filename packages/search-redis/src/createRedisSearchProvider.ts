import type { JobSearchProvider, JobStatus } from '@bull-board/api/typings/app';
import { checkCoverage, inspectJob, readStatus } from './diagnostics';
import { RedisSearchIndex } from './RedisSearchIndex';

export interface RedisSearchProviderOptions {
  statusScanBudget?: number;
}

const SCAN_FACTOR = 10;

export function createRedisSearchProvider(
  index: RedisSearchIndex,
  options: RedisSearchProviderOptions = {}
): JobSearchProvider {
  const matchesStatus = async (jobId: string, status: JobStatus): Promise<boolean> => {
    const state = await index.queue.getJobState(jobId);
    if (status === 'paused') return state === 'waiting' && (await index.queue.isPaused());
    return state === status;
  };

  return {
    fields: async () => [...index.fieldNames],

    search: async ({ field, value, status, cursor, limit }) => {
      if (!index.field(field)) return { jobIds: [] };
      if (!status) return index.page(field, value, cursor, limit);

      const budget = options.statusScanBudget ?? limit * SCAN_FACTOR;
      const jobIds: string[] = [];
      let examined = 0;
      let next = cursor;
      let more = true;

      while (jobIds.length < limit && examined < budget && more) {
        const size = Math.min(limit - jobIds.length, budget - examined);
        const page = await index.page(field, value, next, size);
        const hits = await Promise.all(page.jobIds.map((id) => matchesStatus(id, status)));
        page.jobIds.forEach((id, position) => hits[position] && jobIds.push(id));
        examined += page.jobIds.length;
        next = page.cursor;
        more = page.cursor !== undefined;
      }

      return more ? { jobIds, cursor: next } : { jobIds };
    },

    diagnostics: {
      status: () => readStatus(index),
      inspect: (jobId) => inspectJob(index, jobId),
      checkCoverage: ({ sample }) => checkCoverage(index, sample),
    },
  };
}
