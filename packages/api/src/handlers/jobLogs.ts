import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { GetJobLogsResponse } from '../../typings/responses';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

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
