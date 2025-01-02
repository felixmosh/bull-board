import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';

async function resumeAll(req: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  req.queues.forEach((queue) => queue.resume());
  return { status: 200, body: { message: 'All queues resumed' } };
}

export const resumeAllHandler = resumeAll;
