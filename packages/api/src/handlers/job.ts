import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { jobProvider } from '../providers/job';

async function getJobState(
  _req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  const status = await job.getState();

  return {
    status: 200,
    body: {
      job,
      status,
    },
  };
}

export const jobHandler = queueProvider(jobProvider(getJobState), {
  skipReadOnlyModeCheck: true,
});
