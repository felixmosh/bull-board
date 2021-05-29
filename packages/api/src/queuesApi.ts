import { BaseAdapter } from './queueAdapters/base';
import { BullBoardQueues } from '../typings/app';

export function getQueuesApi(queues: ReadonlyArray<BaseAdapter>) {
  const bullBoardQueues: BullBoardQueues = new Map<string, BaseAdapter>();

  function addQueue(queue: BaseAdapter): void {
    const name = queue.getName();
    bullBoardQueues.set(name, queue);
  }

  function removeQueue(queueOrName: string | BaseAdapter) {
    const name = typeof queueOrName === 'string' ? queueOrName : queueOrName.getName();

    bullBoardQueues.delete(name);
  }

  function setQueues(newBullQueues: ReadonlyArray<BaseAdapter>): void {
    newBullQueues.forEach((queue) => {
      const name = queue.getName();

      bullBoardQueues.set(name, queue);
    });
  }

  function replaceQueues(newBullQueues: ReadonlyArray<BaseAdapter>): void {
    const queuesToPersist: string[] = newBullQueues.map((queue) => queue.getName());

    bullBoardQueues.forEach((_queue, name) => {
      if (queuesToPersist.indexOf(name) === -1) {
        bullBoardQueues.delete(name);
      }
    });

    return setQueues(newBullQueues);
  }

  setQueues(queues);

  return { bullBoardQueues, setQueues, replaceQueues, addQueue, removeQueue };
}
