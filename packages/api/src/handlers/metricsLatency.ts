import type { GetMetricsLatencyQuery } from '../schemas/requests';
import { GetMetricsLatencyResponse } from '../schemas/responses';
import {
  AppControllerRoute,
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsHistoryProvider,
} from '../types';

const DEFAULT_PERCENTILES = [50, 95, 99];

export function createMetricsLatencyHandler(
  provider: MetricsHistoryProvider
): AppControllerRoute<'GetMetricsLatencyResponse', GetMetricsLatencyQuery>['handler'] {
  return async function metricsLatencyHandler(
    req?: BullBoardRequest<GetMetricsLatencyQuery>
  ): Promise<ControllerHandlerReturnType<GetMetricsLatencyResponse>> {
    const { metric, granularity, queue } = req!.query;
    const from = req!.query.from ?? 0;
    const to = req!.query.to ?? Date.now();

    const percentiles = String(req!.query.percentiles ?? '')
      .split(',')
      .map((value) => value.trim())
      // Dropped before the coercion, because Number('') is 0 and 0 is now a legal percentile:
      // an absent `percentiles` would otherwise read as an explicit request for p0 rather
      // than falling back to the defaults.
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      // 0 is a real request, not a typo: it reads the floor of the distribution, the lower
      // edge of the first non-empty bucket. Excluding it silently swapped in the defaults.
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);

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
