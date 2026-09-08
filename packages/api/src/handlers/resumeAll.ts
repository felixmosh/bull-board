import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { EmptyResponse } from '../../typings/responses';

async function resumeAll(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  const relevantQueues = Array.from(req.queues.values()).filter((queue) => !queue.readOnlyMode);

  for (const queue of relevantQueues) {
    if (!(await queue.isVisible(req))) {
      continue;
    }

    const isPaused = await queue.isPaused();
    if (isPaused) {
      await queue.resume();
    }
  }

  return { status: 200, body: {} };
}

export const resumeAllHandler = resumeAll;
