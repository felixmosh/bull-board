import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function emptyQueue(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  await queue.empty();

  return { status: 200, body: {} };
}

export const emptyQueueHandler = queueProvider(emptyQueue);
