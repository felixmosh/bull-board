import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { GetQueueJobDataSchemaResponse } from '../../typings/responses';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

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
