import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { EmptyResponse } from '../../typings/responses';

async function pauseAll(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  const relevantQueues = Array.from(req.queues.values()).filter((queue) => !queue.readOnlyMode);
  for (const queue of relevantQueues) {
    if (!(await queue.isVisible(req))) {
      continue;
    }

    const isPaused = await queue.isPaused();
    if (!isPaused) {
      await queue.pause();
    }
  }

  return { status: 200, body: {} };
}

export const pauseAllHandler = pauseAll;
