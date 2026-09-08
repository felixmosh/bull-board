import {
  AppControllerRoute,
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsHistoryProvider,
} from '../../typings/app';
import {
  GetMetricsHistoryUsageResponse,
  PurgeMetricsHistoryResponse,
} from '../../typings/responses';
import { errorResponse } from '../errors';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
): AppControllerRoute<'PurgeMetricsHistoryResponse'>['handler'] {
  return async function metricsHistoryPurgeHandler(
    req?: BullBoardRequest
  ): Promise<ControllerHandlerReturnType<PurgeMetricsHistoryResponse>> {
    const body = (req?.body ?? {}) as { queue?: unknown; before?: unknown };

    if (body.queue !== undefined && typeof body.queue !== 'string') {
      return errorResponse(400, 'ERRORS.INVALID_QUEUE');
    }
    // A malformed cutoff must not fall through to "purge everything": the two requests
    // differ only by this field, and one of them is unrecoverable.
    if (
      body.before !== undefined &&
      (typeof body.before !== 'string' || !DAY_PATTERN.test(body.before))
    ) {
      return errorResponse(400, 'ERRORS.INVALID_BEFORE_DATE');
    }

    const result = await provider.purge!({
      queue: body.queue as string | undefined,
      before: body.before as string | undefined,
    });
    return { status: 200, body: result };
  };
}
