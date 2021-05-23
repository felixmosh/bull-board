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
  await job.remove();

  return {
    status: 204,
    body: {},
  };
}

export const cleanJobHandler = queueProvider(jobProvider(cleanJob));
