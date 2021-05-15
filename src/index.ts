import express from 'express';
import { Express } from 'express-serve-static-core';
import path from 'path';
import { BullBoardQueues } from './@types/app';
import { BaseAdapter } from './queueAdapters/base';
import { apiRouter } from './routes/apiRouter';
import { entryPoint } from './routes/entryPoint';

export function createBullBoard(
  bullQueues: ReadonlyArray<BaseAdapter>
): {
  router: Express;
  setQueues: (newBullQueues: ReadonlyArray<BaseAdapter>) => void;
  replaceQueues: (newBullQueues: ReadonlyArray<BaseAdapter>) => void;
} {
  const bullBoardQueues: BullBoardQueues = new Map<string, BaseAdapter>();
  const app: Express = express();
  app.locals.bullBoardQueues = bullBoardQueues;

  app.set('view engine', 'ejs');
  app.set('views', path.resolve(__dirname, '../dist/ui'));

  app.use('/static', express.static(path.resolve(__dirname, '../static')));

  app.get(['/', '/queue/:queueName'], entryPoint);
  app.use('/api', apiRouter);

  function setQueues(newBullQueues: ReadonlyArray<BaseAdapter>): void {
    newBullQueues.forEach((queue) => {
      const name = queue.getName();

      bullBoardQueues.set(name, queue);
    });
  }

  function replaceQueues(newBullQueues: ReadonlyArray<BaseAdapter>): void {
    const queuesToPersist: string[] = newBullQueues.map((queue) =>
      queue.getName()
    );

    bullBoardQueues.forEach((_queue, name) => {
      if (queuesToPersist.indexOf(name) === -1) {
        bullBoardQueues.delete(name);
      }
    });

    return setQueues(newBullQueues);
  }

  setQueues(bullQueues);

  return { router: app, setQueues, replaceQueues };
}
