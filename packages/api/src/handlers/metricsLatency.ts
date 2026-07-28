import {
  AppControllerRoute,
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsHistoryGranularity,
  MetricsHistoryProvider,
  MetricsLatencyMetric,
} from '../../typings/app';
import { errorResponse } from '../errors';

const METRICS: MetricsLatencyMetric[] = ['runtime', 'waittime'];
const DEFAULT_PERCENTILES = [50, 95, 99];

export function createMetricsLatencyHandler(
  provider: MetricsHistoryProvider
): AppControllerRoute['handler'] {
  return async function metricsLatencyHandler(
    req?: BullBoardRequest
  ): Promise<ControllerHandlerReturnType> {
    const query = req?.query ?? {};
    const metric = String(query.metric ?? '') as MetricsLatencyMetric;
    if (!METRICS.includes(metric)) {
      return errorResponse(400, 'ERRORS.INVALID_METRIC');
    }

    const granularity: MetricsHistoryGranularity = query.granularity === 'hour' ? 'hour' : 'day';
    const queue =
      typeof query.queue === 'string' && query.queue.length > 0 ? query.queue : undefined;

    const from = Number(query.from) || 0;
    const to = Number(query.to) || Date.now();

    const percentiles = String(query.percentiles ?? '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0 && value <= 100);

    const points = await provider.getLatency!({
      queue,
      metric,
      from,
      to,
      granularity,
      percentiles: percentiles.length > 0 ? percentiles : DEFAULT_PERCENTILES,
    });

    return { status: 200, body: points };
  };
}
