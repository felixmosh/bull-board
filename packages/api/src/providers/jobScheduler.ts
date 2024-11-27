import { BullBoardRequest, ControllerHandlerReturnType, RepeatableJob } from '../../typings/app';
import { BaseAdapter } from '../queueAdapters/base';

export function jobSchedulerProvider(
  next: (
    req: BullBoardRequest,
    jobScheduler: RepeatableJob,
    queue: BaseAdapter
  ) => Promise<ControllerHandlerReturnType>
) {
  return async (
    req: BullBoardRequest,
    queue: BaseAdapter
  ): Promise<ControllerHandlerReturnType> => {
    const { jobSchedulerId } = req.params;

    const jobScheduler = await queue.getJobScheduler(jobSchedulerId);

    if (!jobScheduler) {
      return {
        status: 404,
        body: {
          error: 'Job scheduler not found',
        },
      };
    }

    return next(req, jobScheduler, queue);
  };
}
