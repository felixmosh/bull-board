import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { EmptyResponse } from '../../typings/responses';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function resumeQueue(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  await queue.resume();

  return { status: 200, body: {} };
}

export const resumeQueueHandler = queueProvider(resumeQueue);
