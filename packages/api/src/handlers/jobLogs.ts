import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import { GetJobLogsResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType } from '../types';

async function jobLogs(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<GetJobLogsResponse>> {
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
