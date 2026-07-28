import { BullBoardRequest, ControllerHandlerReturnType, JobRetryStatus } from '../../typings/app';
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

  const jobs = await queue.getJobs([queueStatus]);
  await Promise.all(jobs.map((job) => job.retry(queueStatus)));

  return { status: 200, body: {} };
}

export const retryAllHandler = queueProvider(retryAll);
