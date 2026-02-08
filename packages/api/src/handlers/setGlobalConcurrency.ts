import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function setGlobalConcurrency(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { concurrency } = req.body;

  if (typeof concurrency !== 'number' || !Number.isInteger(concurrency) || concurrency < 0) {
    return { status: 400, body: { error: 'Invalid concurrency value' } };
  }

  await queue.setGlobalConcurrency(concurrency);
  return { status: 200, body: {} };
}

export const setGlobalConcurrencyHandler = queueProvider(setGlobalConcurrency);
