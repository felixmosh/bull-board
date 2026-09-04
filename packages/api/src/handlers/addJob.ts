import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { AddJobResponse } from '../../typings/responses';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import { formatJob } from './queues';

async function addJob(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<AddJobResponse>> {
  const { name, data, options } = req.body;

  const job = await queue.addJob(name, data, options);

  return {
    status: 200,
    body: {
      job: formatJob(job, queue),
      status: await job.getState(),
    },
  };
}

export const addJobHandler = queueProvider(addJob);
