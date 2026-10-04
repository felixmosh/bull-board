import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import { GetQueuesHasWorkersResponse, GetQueueWorkersResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType } from '../types';

/**
 * The full worker list for one queue, for the section of the queue info panel that shows it.
 * The board's warning badge only needs `queuesHasWorkersHandler`, so this is asked for once,
 * when the panel opens, rather than on an interval.
 */
async function getQueueWorkers(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<GetQueueWorkersResponse>> {
  if (req.uiConfig?.showWorkers === false) {
    return errorResponse(403, 'ERRORS.WORKERS_DISABLED');
  }

  // `null` keeps "could not ask" distinct from "asked, nobody is there", so an unreachable
  // queue leaves the section out instead of claiming its workers are gone.
  const workers = await queue.getWorkers().catch(() => null);

  return { status: 200, body: { workers } };
}

export const queueWorkersHandler = queueProvider(getQueueWorkers, {
  skipReadOnlyModeCheck: true,
});

export async function queuesHasWorkersHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType<GetQueuesHasWorkersResponse>> {
  if (req.uiConfig?.showWorkers === false) {
    return errorResponse(403, 'ERRORS.WORKERS_DISABLED');
  }

  const entries = await Promise.all(
    [...req.queues.entries()].map(async ([queueName, queue]) => {
      if (!(await queue.isVisible(req))) {
        return null;
      }

      const workers = await queue.getWorkers().catch(() => null);
      return [queueName, workers && workers.length > 0] as const;
    })
  );

  return {
    status: 200,
    body: { hasWorkers: Object.fromEntries(entries.filter((entry) => entry !== null)) },
  };
}
