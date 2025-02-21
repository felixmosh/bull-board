import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';

async function pauseAll(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const relevantQueues = Array.from(req.queues.values()).filter((queue) => !queue.readOnlyMode);
  for (const queue of relevantQueues) {
    const isPaused = await queue.isPaused();
    if (!isPaused) {
      await queue.pause();
    }
  }

  return { status: 200, body: { message: 'All queues paused' } };
}

export const pauseAllHandler = pauseAll;
