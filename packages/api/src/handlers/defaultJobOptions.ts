import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function getDefaultJobOptions(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  return {
    status: 200,
    body: queue.getQueueDefaultJobOptions(),
  };
}

export const defaultJobOptionsHandler = queueProvider(getDefaultJobOptions, {
  skipReadOnlyModeCheck: true,
});
