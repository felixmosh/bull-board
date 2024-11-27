import { BaseAdapter } from '../queueAdapters/base';
import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { formatJob } from './queues';

async function addJobScheduler(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { jobSchedulerName, repeatOptions, jobTemplate } = req.body;

  const job = await queue.upsertJobScheduler(jobSchedulerName, repeatOptions, jobTemplate);

  return {
    status: 200,
    body: {
      job: formatJob(job, queue),
      status: job.getState(),
    },
  };
}

export const addJobSchedulerHandler = queueProvider(addJobScheduler);
