import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';
import type { NextApiRequest, NextApiResponse } from 'next';
import { queue } from '../../../lib/queue';

const basePath = '/api/queues';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(basePath);

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter,
});

const app = express();
app.use(basePath, serverAdapter.getRouter());

// Let Express handle body parsing and the response.
export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return (app as unknown as (req: NextApiRequest, res: NextApiResponse) => void)(req, res);
}
