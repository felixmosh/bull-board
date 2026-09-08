import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { EmptyResponse } from '../../typings/responses';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';

async function promoteJob(
  _req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  await job.promote();

  return {
    status: 204,
    body: {},
  };
}

export const promoteJobHandler = queueProvider(jobProvider(promoteJob));
