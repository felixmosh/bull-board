import { BullBoardRequest, ControllerHandlerReturnType, QueueWorkers } from '../../typings/app';
import { errorResponse } from '../errors';

export async function queueWorkersHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  if (req.uiConfig?.showWorkers === false) {
    return errorResponse(403, 'ERRORS.WORKERS_DISABLED');
  }

  const workers: QueueWorkers = {};

  const entries = await Promise.all(
    [...req.queues.entries()].map(async ([queueName, queue]) => {
      if (!(await queue.isVisible(req))) {
        return null;
      }

      // A queue whose Redis is unreachable should not take the whole board down,
      // it is reported the same way as one that cannot answer.
      const queueWorkers = await queue.getWorkers().catch(() => null);
      return [queueName, queueWorkers] as const;
    })
  );

  for (const entry of entries) {
    if (entry) {
      workers[entry[0]] = entry[1];
    }
  }

  return { body: { workers } };
}
