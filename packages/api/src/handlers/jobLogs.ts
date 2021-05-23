import { BaseAdapter } from '../queueAdapters/base';
import {
  BullBoardRequest,
  ControllerHandlerReturnType,
} from '../../typings/app';
import { queueProvider } from '../providers/queue';

async function jobLogs(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { jobId } = req.params;
  const logs = await queue.getJobLogs(jobId);

  return {
    status: 200,
    body: logs,
  };
}

export const jobLogsHandler = queueProvider(jobLogs, {
  skipReadOnlyModeCheck: true,
});
