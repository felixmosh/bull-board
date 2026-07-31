import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

/**
 * The full worker list for one queue, for the section of the queue info panel that shows it.
 * The board itself only needs `hasWorkers` off the queue listing, so this is asked for once,
 * when the panel opens, rather than on the polling interval.
 */
async function getQueueWorkers(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
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
