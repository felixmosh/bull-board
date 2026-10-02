import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import express from 'express';

await Promise.resolve();

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/ui');
createBullBoard({
  queues: [],
  serverAdapter,
  options: { uiBasePath: process.env.BULL_BOARD_UI_BASE_PATH },
});

const app = express();
app.use('/ui', serverAdapter.getRouter());
const server = app.listen(0, () => process.stdout.write(`LISTENING ${server.address().port}\n`));
