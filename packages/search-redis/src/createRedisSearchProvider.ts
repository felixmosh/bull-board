import type { JobSearchProvider, JobStatus } from '@bull-board/api/typings/app';
import { checkCoverage, inspectJob, readStatus } from './diagnostics';
import { RedisSearchIndex } from './RedisSearchIndex';

export function createRedisSearchProvider(index: RedisSearchIndex): JobSearchProvider {
  const matchesStatus = async (jobId: string, status: JobStatus): Promise<boolean> => {
    const state = await index.queue.getJobState(jobId);
    if (status === 'paused') return state === 'waiting' && (await index.queue.isPaused());
    return state === status;
  };

  return {
    fields: async () => [...index.fieldNames],

    search: async ({ field, value, status, cursor, limit }) => {
      if (!index.field(field)) return { jobIds: [] };
      const page = await index.page(field, value, cursor, limit);
      if (!status) return page;

      const hits = await Promise.all(page.jobIds.map((id) => matchesStatus(id, status)));
      return { ...page, jobIds: page.jobIds.filter((_, position) => hits[position]) };
    },

    diagnostics: {
      status: () => readStatus(index),
      inspect: (jobId) => inspectJob(index, jobId),
      checkCoverage: ({ sample }) => checkCoverage(index, sample),
    },
  };
}
