import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { errorResponse } from '../errors';
import { BaseAdapter } from '../queueAdapters/base';

export function queueProvider<TBody>(
  next: (req: BullBoardRequest, queue: BaseAdapter) => Promise<ControllerHandlerReturnType<TBody>>,
  {
    skipReadOnlyModeCheck = false,
  }: {
    skipReadOnlyModeCheck?: boolean;
  } = {}
) {
  return async (req: BullBoardRequest): Promise<ControllerHandlerReturnType<TBody>> => {
    const { queueName } = req.params;

    const queue = req.queues.get(queueName);
    if (!queue || !(await queue.isVisible(req))) {
      return errorResponse(404, 'ERRORS.QUEUE_NOT_FOUND');
    } else if (queue.readOnlyMode && !skipReadOnlyModeCheck) {
      return errorResponse(405, 'ERRORS.QUEUE_READ_ONLY');
    }

    return next(req, queue);
  };
}
