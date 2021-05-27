import { Request, RequestHandler, Response } from 'express-serve-static-core';
import { QueueJob } from '../../@types/app';

export const promoteJob: RequestHandler = async (_req: Request, res: Response) => {
  const { job } = res.locals as { job: QueueJob };

  await job.promote();

  return res.sendStatus(204);
};
