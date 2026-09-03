import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { errorResponse } from '../errors';
import { BaseAdapter } from '../queueAdapters/base';

export function jobProvider<TBody>(
  next: (
    req: BullBoardRequest,
    job: QueueJob,
    queue: BaseAdapter
  ) => Promise<ControllerHandlerReturnType<TBody>>
) {
  return async (
    req: BullBoardRequest,
    queue: BaseAdapter
  ): Promise<ControllerHandlerReturnType<TBody>> => {
    const { jobId } = req.params;

    const job = await queue.getJob(jobId);

    if (!job) {
      return errorResponse(404, 'ERRORS.JOB_NOT_FOUND');
    }

    return next(req, job, queue);
  };
}
