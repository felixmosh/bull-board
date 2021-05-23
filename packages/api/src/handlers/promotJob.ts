import {
  BullBoardRequest,
  ControllerHandlerReturnType,
  QueueJob,
} from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { jobProvider } from '../providers/job';

async function promoteJob(
  _req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  await job.promote();

  return {
    status: 204,
    body: {},
  };
}

export const promoteJobHandler = queueProvider(jobProvider(promoteJob));
