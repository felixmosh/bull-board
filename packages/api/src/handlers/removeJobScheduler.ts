import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function removeJobScheduler(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { schedulerId } = req.params;

  const removed = await queue.removeJobScheduler(schedulerId);

  if (!removed) {
    return {
      status: 404,
      body: { error: 'Job scheduler not found' },
    };
  }

  return {
    status: 204,
    body: {},
  };
}

export const removeJobSchedulerHandler = queueProvider(removeJobScheduler);
