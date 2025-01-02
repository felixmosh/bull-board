import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';

async function pauseAll(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  req.queues.forEach((queue) => queue.pause());
  return { status: 200, body: { message: 'All queues paused' } };
}

export const pauseAllHandler = pauseAll;
