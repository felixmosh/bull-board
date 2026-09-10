import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import { GetQueueJobDataSchemaResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType } from '../types';

async function getJobDataSchema(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<GetQueueJobDataSchemaResponse>> {
  return {
    status: 200,
    body: queue.getJobDataSchema() || {},
  };
}

export const jobDataSchemaHandler = queueProvider(getJobDataSchema, {
  skipReadOnlyModeCheck: true,
});
