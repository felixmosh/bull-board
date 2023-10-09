import { BaseAdapter } from '../queueAdapters/base';
import {
  BullBoardRequest,
  ControllerHandlerReturnType,
} from '../../typings/app';
import { queueProvider } from '../providers/queue';

async function getMetrics(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const type = req.query?.type || 'completed';
  const metrics = await queue.getMetrics(type);

  if (metrics) {
    return {
      status: 200,
      body: metrics,
    };
  } else {
    return {
      status: 404,
      body: { error: 'Metrics not available' },
    };
  }
}

export const metricsHandler = queueProvider(getMetrics, {
  skipReadOnlyModeCheck: true,
});
