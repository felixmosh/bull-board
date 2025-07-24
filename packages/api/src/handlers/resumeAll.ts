import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';

async function resumeAll(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
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

  return { status: 200, body: { message: 'All queues resumed' } };
}

export const resumeAllHandler = resumeAll;
