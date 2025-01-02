import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';

async function pauseAll(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  req.queues.forEach(async (queue) => {
    const isPaused = await queue.isPaused();
    if (!isPaused) {
      queue.pause();
    }
  });
  return { status: 200, body: { message: 'All queues paused' } };
}

export const pauseAllHandler = pauseAll;
