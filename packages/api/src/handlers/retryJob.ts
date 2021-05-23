import {
  BullBoardRequest,
  ControllerHandlerReturnType,
  QueueJob,
} from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';

async function retryJob(
  _req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  await job.retry();

  return {
    status: 204,
    body: {},
  };
}

export const retryJobHandler = queueProvider(jobProvider(retryJob));
