import { BullBoardRequest, ControllerHandlerReturnType, JobRetryStatus } from '../../typings/app';
import { RetryAllResponse } from '../../typings/responses';
import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

const RETRY_PAGE_SIZE = 100;

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
  const total = counts[queueStatus] ?? 0;
  const retriedIds = new Set<string>();

  while (retriedIds.size < total) {
    const headOfSet = await queue.getJobs([queueStatus], 0, RETRY_PAGE_SIZE - 1);
    const notYetRetried = headOfSet.filter((job) => !retriedIds.has(`${job.toJSON().id}`));

    if (notYetRetried.length === 0) {
      break;
    }

    await Promise.all(notYetRetried.map((job) => job.retry(queueStatus)));
    notYetRetried.forEach((job) => retriedIds.add(`${job.toJSON().id}`));
  }

  const response: RetryAllResponse = {
    retried: retriedIds.size,
    skipped: Math.max(0, total - retriedIds.size),
  };

  return { status: 200, body: response };
}

export const retryAllHandler = queueProvider(retryAll);
