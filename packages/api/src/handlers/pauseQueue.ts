import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import { EmptyResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType } from '../types';

async function pauseQueue(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  await queue.pause();

  return { status: 200, body: {} };
}

export const pauseQueueHandler = queueProvider(pauseQueue);
