import { BaseAdapter } from '../queueAdapters/base';
import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { queueProvider } from '../providers/queue';

async function job(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { jobId } = req.params;
  const job = await queue.getJob(jobId);

  return {
    status: 200,
    body: { [jobId]: job },
  };
}

export const jobHandler = queueProvider(job, {
  skipReadOnlyModeCheck: true,
});
