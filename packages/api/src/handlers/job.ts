import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { jobProvider } from '../providers/job';
import { BaseAdapter } from '../queueAdapters/base';
import { formatJob } from './queues';

async function getJobState(
  _req: BullBoardRequest,
  job: QueueJob,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const status = await job.getState();

  return {
    status: 200,
    body: {
      job: formatJob(job, queue),
      status,
    },
  };
}

export const jobHandler = queueProvider(jobProvider(getJobState), {
  skipReadOnlyModeCheck: true,
});
