import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { EmptyResponse } from '../../typings/responses';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function pauseQueue(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  await queue.pause();

  return { status: 200, body: {} };
}

export const pauseQueueHandler = queueProvider(pauseQueue);
