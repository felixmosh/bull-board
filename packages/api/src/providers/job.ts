import {
  BullBoardRequest,
  ControllerHandlerReturnType,
  QueueJob,
} from '../../typings/app';
import { BaseAdapter } from '../queueAdapters/base';

export function jobProvider(
  next: (
    req: BullBoardRequest,
    job: QueueJob
  ) => Promise<ControllerHandlerReturnType>
) {
  return async (
    req: BullBoardRequest,
    queue: BaseAdapter
  ): Promise<ControllerHandlerReturnType> => {
    const { jobId } = req.params;

    const job = await queue.getJob(jobId);

    if (!job) {
      return {
        status: 404,
        body: {
          error: 'Job not found',
        },
      };
    }

    return next(req, job);
  };
}
