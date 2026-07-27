import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function obliterateQueue(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const isPaused = await queue.isPaused();

  if (!isPaused) {
    return errorResponse(400, 'ERRORS.QUEUE_NOT_PAUSED');
  }

  await queue.obliterate();

  return { status: 200, body: {} };
}

export const obliterateQueueHandler = queueProvider(obliterateQueue);
