import { BullBoardRequest, ControllerHandlerReturnType, JobRetryStatus } from '../../typings/app';
import { BaseAdapter } from '../queueAdapters/base';
import { queueProvider } from '../providers/queue';

function isRetriableState(state: string): state is JobRetryStatus {
  return state === 'failed' || state === 'completed';
}

async function retryAll(
  req: BullBoardRequest,
  queue: BaseAdapter,
): Promise<ControllerHandlerReturnType> {
  const { queueStatus } = req.params;

  if (!isRetriableState(queueStatus)) {
    return {
      status: 400,
      body: { error: `"${queueStatus}" is not a retriable status` },
    };
  }

  const jobs = await queue.getJobs([queueStatus]);
  await Promise.all(jobs.map((job) => job.retry(queueStatus)));

  return { status: 200, body: {} };
}

export const retryAllHandler = queueProvider(retryAll);
