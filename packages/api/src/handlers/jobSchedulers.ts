import { AppJobScheduler, BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { BaseAdapter } from '../queueAdapters/base';

async function visibleQueues(req: BullBoardRequest): Promise<[string, BaseAdapter][]> {
  const requested = req.query?.queueName;
  const pairs: [string, BaseAdapter][] = [];

  for (const [queueName, queue] of req.queues.entries()) {
    if (requested && decodeURIComponent(requested) !== queueName) {
      continue;
    }

    if (await queue.isVisible(req)) {
      pairs.push([queueName, queue]);
    }
  }

  return pairs;
}

/**
 * Every scheduler the board can see, tagged with the queue it belongs to. Unlike the queues
 * route this one is not polled, which is what makes the per-scheduler lookups behind `lastRun`
 * affordable.
 */
export async function jobSchedulersHandler(
  req: BullBoardRequest
): Promise<ControllerHandlerReturnType> {
  const pairs = await visibleQueues(req);

  const perQueue = await Promise.all(
    pairs.map(async ([queueName, queue]): Promise<AppJobScheduler[]> => {
      const schedulers = await queue.getJobSchedulers();

      return schedulers.map((scheduler) => ({ ...scheduler, queueName }));
    })
  );

  return {
    body: {
      schedulers: perQueue.flat(),
    },
  };
}
