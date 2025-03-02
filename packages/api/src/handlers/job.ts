import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { jobProvider } from '../providers/job';
import { BaseAdapter } from '../queueAdapters/base';
import { formatJob } from './queues';

async function getJobState(
  req: BullBoardRequest,
  job: QueueJob,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { jobId } = req.params;
  const status = await job.getState();
  const jobTree = await queue.getJobTree(jobId);

  return {
    status: 200,
    body: {
      job: formatJob(job, queue),
      status,
      jobTree: jobTree ?? [],
    },
  };
}

export const jobHandler = queueProvider(jobProvider(getJobState), {
  skipReadOnlyModeCheck: true,
});
