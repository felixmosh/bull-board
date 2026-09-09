import type { PurgeMetricsHistoryBody } from '../schemas/requests';
import { GetMetricsHistoryUsageResponse, PurgeMetricsHistoryResponse } from '../schemas/responses';
import {
  AppControllerRoute,
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsHistoryProvider,
} from '../types';

export function createMetricsHistoryUsageHandler(
  provider: MetricsHistoryProvider
): AppControllerRoute<'GetMetricsHistoryUsageResponse'>['handler'] {
  return async function metricsHistoryUsageHandler(): Promise<
    ControllerHandlerReturnType<GetMetricsHistoryUsageResponse>
  > {
    const usage = await provider.getUsage!();
    return { status: 200, body: usage };
  };
}

export function createMetricsHistoryPurgeHandler(
  provider: MetricsHistoryProvider
): AppControllerRoute<
  'PurgeMetricsHistoryResponse',
  Record<string, any>,
  PurgeMetricsHistoryBody
>['handler'] {
  return async function metricsHistoryPurgeHandler(
    req?: BullBoardRequest<Record<string, any>, PurgeMetricsHistoryBody>
  ): Promise<ControllerHandlerReturnType<PurgeMetricsHistoryResponse>> {
    const { queue, before } = req!.body;
    const result = await provider.purge!({ queue, before });
    return { status: 200, body: result };
  };
}
