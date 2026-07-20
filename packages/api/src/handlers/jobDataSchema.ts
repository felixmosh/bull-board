import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function getJobDataSchema(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  return {
    status: 200,
    body: queue.getJobDataSchema() || {},
  };
}

export const jobDataSchemaHandler = queueProvider(getJobDataSchema, {
  skipReadOnlyModeCheck: true,
});
