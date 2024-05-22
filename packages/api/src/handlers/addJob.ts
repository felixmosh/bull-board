import { BaseAdapter } from '../queueAdapters/base';
import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { queueProvider } from '../providers/queue';
import { formatJob } from './queues';

async function addJob(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { name, data, options } = req.body;

  const job = await queue.addJob(name, data, options);

  return {
    status: 200,
    body: {
      job: formatJob(job, queue),
      status: job.getState(),
    },
  };
}

export const addJobHandler = queueProvider(addJob);
