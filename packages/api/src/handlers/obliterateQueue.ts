import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function obliterateQueue(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const isPaused = await queue.isPaused();

  if (!isPaused) {
    return {
      status: 400,
      body: { error: 'Queue must be paused before obliteration' },
    };
  }

  await queue.obliterate();

  return { status: 200, body: {} };
}

export const obliterateQueueHandler = queueProvider(obliterateQueue);
