import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function removeJobScheduler(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { schedulerId } = req.params;

  const removed = await queue.removeJobScheduler(schedulerId);

  if (!removed) {
    return errorResponse(404, 'ERRORS.JOB_SCHEDULER_NOT_FOUND');
  }

  return {
    status: 204,
    body: {},
  };
}

export const removeJobSchedulerHandler = queueProvider(removeJobScheduler);
