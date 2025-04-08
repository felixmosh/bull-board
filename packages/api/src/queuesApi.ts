import { BaseAdapter } from './queueAdapters/base';
import {BullBoardQueues, QueuesConfig} from '../typings/app';
import {BullMQAdapter} from "./queueAdapters/bullMQ";
import {Queue} from "bullmq";

export function getQueuesApi(queues: ReadonlyArray<BaseAdapter>, queuesConfig: QueuesConfig = {}) {
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

  async function discoverQueues() {
    const autoDiscover = queuesConfig.autoDiscover;
    if (autoDiscover) {
      const prefix = autoDiscover.prefix || 'bull';
      const pattern = new RegExp(`^${prefix}:([^:]+):(id|failed|active|waiting|stalled-check)$`);
      (await autoDiscover.connection.keys(`${prefix}:*`))
        .map((key) => {
          const match = pattern.exec(key);
          if (match && match[1]) {
            return match[1];
          }
          return null;
        })
        .filter((queueName) => queueName !== null)
        .forEach((queueName) => {
          addQueue(new BullMQAdapter(
              new Queue<unknown, unknown, string>(queueName, {
                connection: autoDiscover.connection,
                prefix,
              }),
          ));
        });
    }
  }

  setQueues(queues);

  return { bullBoardQueues, setQueues, replaceQueues, addQueue, removeQueue, discoverQueues };
}
