import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

async function getMetrics(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
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
