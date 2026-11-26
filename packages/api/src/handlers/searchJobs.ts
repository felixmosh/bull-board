import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import type { SearchJobsQuery } from '../schemas/requests';
import { GetQueueSearchFieldsResponse, SearchJobsResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType, JobStatus } from '../types';
import { formatJob } from './queues';

async function searchFields(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<GetQueueSearchFieldsResponse>> {
  if (!queue.searchProvider) {
    return errorResponse(404, 'ERRORS.SEARCH_NOT_CONFIGURED');
  }

  const { diagnostics } = queue.searchProvider;

  return {
    status: 200,
    body: {
      fields: await queue.searchProvider.fields(),
      diagnostics: {
        status: !!diagnostics,
        inspect: !!diagnostics?.inspect,
        coverage: !!diagnostics?.checkCoverage,
      },
    },
  };
}

async function searchJobs(
  req: BullBoardRequest<SearchJobsQuery>,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<SearchJobsResponse>> {
  const provider = queue.searchProvider;
  if (!provider) {
    return errorResponse(404, 'ERRORS.SEARCH_NOT_CONFIGURED');
  }

  const { field, value, cursor, limit } = req.query;
  const fields = await provider.fields();
  if (!fields.includes(field)) {
    return errorResponse(400, { key: 'ERRORS.SEARCH_FIELD_NOT_INDEXED', options: { field } });
  }

  const status =
    req.query.status && req.query.status !== 'latest' ? (req.query.status as JobStatus) : undefined;
  const result = await provider.search({ field, value, status, cursor, limit });

  const jobs = await Promise.all(result.jobIds.slice(0, limit).map((id) => queue.getJob(id)));
  const found = await Promise.all(
    jobs
      .filter((job): job is NonNullable<typeof job> => !!job)
      .map(async (job) => ({ job, state: await job.getState() }))
  );
  const results = found
    .filter(({ state }) => !status || state === status)
    .map(({ job, state }) => ({ job: formatJob(job, queue), status: state }));

  return {
    status: 200,
    body: { results, ...(result.cursor ? { cursor: result.cursor } : {}) },
  };
}

export const searchFieldsHandler = queueProvider(searchFields, { skipReadOnlyModeCheck: true });

export const searchJobsHandler = queueProvider(searchJobs, { skipReadOnlyModeCheck: true });
