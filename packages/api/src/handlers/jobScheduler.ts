import { RepeatableJob } from 'bullmq';
import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { jobSchedulerProvider } from '../providers/jobScheduler';
import { queueProvider } from '../providers/queue';

async function getJobSchedulerState(
  _req: BullBoardRequest,
  jobScheduler: RepeatableJob
): Promise<ControllerHandlerReturnType> {
  return {
    status: 200,
    body: {
      jobScheduler,
    },
  };
}

export const jobSchedulerHandler = queueProvider(jobSchedulerProvider(getJobSchedulerState), {
  skipReadOnlyModeCheck: true,
});
