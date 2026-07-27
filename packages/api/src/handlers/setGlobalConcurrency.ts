import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function setGlobalConcurrency(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { concurrency } = req.body;

  if (typeof concurrency !== 'number' || !Number.isInteger(concurrency) || concurrency < 0) {
    return errorResponse(400, 'ERRORS.INVALID_CONCURRENCY');
  }

  await queue.setGlobalConcurrency(concurrency);
  return { status: 200, body: {} };
}

export const setGlobalConcurrencyHandler = queueProvider(setGlobalConcurrency);
