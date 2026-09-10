import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import { EmptyResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType } from '../types';

async function resumeQueue(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  await queue.resume();

  return { status: 200, body: {} };
}

export const resumeQueueHandler = queueProvider(resumeQueue);
