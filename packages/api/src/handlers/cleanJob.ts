import {
  BullBoardRequest,
  ControllerHandlerReturnType,
  QueueJob,
} from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';

async function cleanJob(
  _req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  if (job.repeatJobKey) {
    const { queueName } = _req.params;
    const queue = _req.queues.get(queueName);
    await queue.removeJobScheduler(job.repeatJobKey);
  } else {
    await job.remove();
  }

  return {
    status: 204,
    body: {},
  };
}

export const cleanJobHandler = queueProvider(jobProvider(cleanJob));
