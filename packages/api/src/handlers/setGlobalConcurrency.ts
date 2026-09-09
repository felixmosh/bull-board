import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import type { SetGlobalConcurrencyBody } from '../schemas/requests';
import type { EmptyResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType } from '../types';

async function setGlobalConcurrency(
  req: BullBoardRequest<Record<string, any>, SetGlobalConcurrencyBody>,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  await queue.setGlobalConcurrency(req.body.concurrency);
  return { status: 200, body: {} };
}

export const setGlobalConcurrencyHandler = queueProvider(setGlobalConcurrency);
