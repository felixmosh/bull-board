import { NextFunction, Request, Response } from 'express-serve-static-core';
import { BullBoardQueues } from '../../@types/app';

export function queueProvider({
  skipReadOnlyModeCheck = false,
}: {
  skipReadOnlyModeCheck?: boolean;
} = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { queueName } = req.params;

    if (typeof queueName === 'undefined') {
      return next();
    }

    const { bullBoardQueues } = req.app.locals as {
      bullBoardQueues: BullBoardQueues;
    };

    const queue = bullBoardQueues.get(queueName);
    if (!queue) {
      return res.status(404).send({ error: 'Queue not found' });
    } else if (queue.readOnlyMode && !skipReadOnlyModeCheck) {
      return res.status(405).send({
        error: 'Method not allowed on read only queue',
      });
    }

    res.locals.queue = queue;

    next();
  };
}
