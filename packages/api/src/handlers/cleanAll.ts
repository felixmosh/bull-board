import { BaseAdapter } from '../queueAdapters/base';
import {
  BullBoardRequest,
  ControllerHandlerReturnType,
} from '../../typings/app';
import { queueProvider } from '../providers/queue';

async function cleanAll(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { queueStatus } = req.params;

  const GRACE_TIME_MS = 5000;

  await queue.clean(queueStatus as any, GRACE_TIME_MS);

  return {
    status: 200,
    body: {},
  };
}

export const cleanAllHandler = queueProvider(cleanAll);
