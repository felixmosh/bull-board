import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { BaseAdapter } from '../queueAdapters/base';
import { queueProvider } from '../providers/queue';

async function retryAll(
  req: BullBoardRequest,
  queue: BaseAdapter,
): Promise<ControllerHandlerReturnType> {
  const { queueStatus } = req.params;

  const jobs = await queue.getJobs([queueStatus]);
  await Promise.all(jobs.map((job) => job.retry(queueStatus)));

  return { status: 200, body: {} };
}

export const retryAllHandler = queueProvider(retryAll);
