import {
  AppControllerRoute,
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsHistoryProvider,
} from '../../typings/app';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function createMetricsHistoryUsageHandler(
  provider: MetricsHistoryProvider
): AppControllerRoute['handler'] {
  return async function metricsHistoryUsageHandler(): Promise<ControllerHandlerReturnType> {
    const usage = await provider.getUsage!();
    return { status: 200, body: usage };
  };
}

export function createMetricsHistoryPurgeHandler(
  provider: MetricsHistoryProvider
): AppControllerRoute['handler'] {
  return async function metricsHistoryPurgeHandler(
    req?: BullBoardRequest
  ): Promise<ControllerHandlerReturnType> {
    const body = (req?.body ?? {}) as { queue?: unknown; before?: unknown };

    if (body.queue !== undefined && typeof body.queue !== 'string') {
      return { status: 400, body: { error: 'Invalid queue' } };
    }
    // A malformed cutoff must not fall through to "purge everything": the two requests
    // differ only by this field, and one of them is unrecoverable.
    if (
      body.before !== undefined &&
      (typeof body.before !== 'string' || !DAY_PATTERN.test(body.before))
    ) {
      return { status: 400, body: { error: 'Invalid before: expected YYYY-MM-DD' } };
    }

    const result = await provider.purge!({
      queue: body.queue as string | undefined,
      before: body.before as string | undefined,
    });
    return { status: 200, body: result };
  };
}
