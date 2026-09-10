import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import { GetQueueMetricsResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType } from '../types';

async function getMetrics(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<GetQueueMetricsResponse>> {
  const [completed, failed] = await Promise.all([
    queue.getMetrics('completed').catch(() => null),
    queue.getMetrics('failed').catch(() => null),
  ]);

  return {
    status: 200,
    body: { completed, failed },
  };
}

export const metricsHandler = queueProvider(getMetrics, {
  skipReadOnlyModeCheck: true,
});
