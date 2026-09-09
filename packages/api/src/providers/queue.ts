import { errorResponse } from '../errors';
import { BaseAdapter } from '../queueAdapters/base';
import { BullBoardRequest, ControllerHandlerReturnType } from '../types';

export function queueProvider<TBody, TRequest extends BullBoardRequest<any, any>>(
  next: (req: TRequest, queue: BaseAdapter) => Promise<ControllerHandlerReturnType<TBody>>,
  {
    skipReadOnlyModeCheck = false,
  }: {
    skipReadOnlyModeCheck?: boolean;
  } = {}
) {
  return async (req: TRequest): Promise<ControllerHandlerReturnType<TBody>> => {
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
