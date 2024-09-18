import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';

async function updateJobData(
  req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  const { jobData } = req.body;

  if ('updateData' in job) {
    await job.updateData!(jobData);
  } else if ('update' in job) {
    await job.update!(jobData);
  }

  return {
    status: 200,
    body: {},
  };
}

export const updateJobDataHandler = queueProvider(jobProvider(updateJobData));
