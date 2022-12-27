import {
  BullBoardRequest,
  ControllerHandlerReturnType,
  QueueJob,
} from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';

async function retryJob(
  req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  const { queueStatus } = req.params;

  await job.retry(queueStatus);

  return {
    status: 204,
    body: {},
  };
}

export const retryJobHandler = queueProvider(jobProvider(retryJob));
