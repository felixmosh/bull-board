import { BullBoardRequest, ControllerHandlerReturnType, JobRetryStatus } from '../../typings/app';
import { RetryAllResponse } from '../../typings/responses';
import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

function isRetriableState(state: string): state is JobRetryStatus {
  return state === 'failed' || state === 'completed';
}

async function retryAll(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { queueStatus } = req.params;

  if (!isRetriableState(queueStatus)) {
    return errorResponse(400, {
      key: 'ERRORS.STATUS_NOT_RETRIABLE',
      options: { status: queueStatus },
    });
  }

  // Counted first so a job finishing mid-request understates the gap rather than inventing one.
  const counts = await queue.getJobCounts();
  const jobs = await queue.getJobs([queueStatus]);
  await Promise.all(jobs.map((job) => job.retry(queueStatus)));

  const response: RetryAllResponse = {
    retried: jobs.length,
    skipped: Math.max(0, (counts[queueStatus] ?? 0) - jobs.length),
  };

  return { status: 200, body: response };
}

export const retryAllHandler = queueProvider(retryAll);
