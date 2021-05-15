import { Request, RequestHandler, Response } from 'express-serve-static-core';
import { BaseAdapter } from '../../queueAdapters/base';

export const retryAll: RequestHandler = async (
  _req: Request,
  res: Response
) => {
  const { queue } = res.locals as { queue: BaseAdapter };

  const jobs = await queue.getJobs(['failed']);
  await Promise.all(jobs.map((job) => job.retry()));

  return res.sendStatus(200);
};
