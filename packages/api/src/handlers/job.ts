import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { jobProvider } from '../providers/job';

async function getJobState(
  _req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const state = await job?.getState();

  return {
    status: 200,
    body: {
      job,
      state,
    },
  };
}

export const jobHandler = queueProvider(jobProvider(getJobState), {
  skipReadOnlyModeCheck: true,
});
