import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { EmptyResponse } from '../../typings/responses';
import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

/**
 * Bull and BullMQ both surface the "there are active jobs" refusal as a plain Error carrying this
 * exact message (`scripts.ts`, obliterate return code -2), so the message is the only thing there
 * is to match on.
 */
function isActiveJobsError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Cannot obliterate queue with active jobs';
}

async function obliterateQueue(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  const isPaused = await queue.isPaused();

  if (!isPaused) {
    return errorResponse(400, 'ERRORS.QUEUE_NOT_PAUSED');
  }

  // Pausing a queue stops new jobs from being picked up, but jobs already being processed keep
  // running, and both Bull and BullMQ refuse to obliterate while any of them is active. `force`
  // is the opt-in for wiping the queue anyway.
  const force = req.body?.force === true;

  try {
    await queue.obliterate({ force });
  } catch (error) {
    if (isActiveJobsError(error)) {
      // Without this the refusal reaches the UI as a bare "Internal server error", which says
      // nothing about the active jobs or about the force option that gets past them.
      return errorResponse(409, 'ERRORS.QUEUE_HAS_ACTIVE_JOBS', {
        message: { key: 'ERRORS.QUEUE_HAS_ACTIVE_JOBS_DETAILS' },
      });
    }

    throw error;
  }

  return { status: 200, body: {} };
}

export const obliterateQueueHandler = queueProvider(obliterateQueue);
