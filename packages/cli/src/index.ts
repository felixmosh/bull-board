import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { Redis } from 'ioredis';
import type { CliConfig } from './config/types';
import { discoverQueues, probeQueues } from './discovery';
import { createQueueFactory } from './queueFactory';
import { QueueRegistry } from './registry';
import { startServer } from './server';

export interface RunningBoard {
  url: string;
  close(): Promise<void>;
}

export async function run(config: CliConfig, log = console): Promise<RunningBoard> {
  const client = new Redis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
  await client.connect();

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(config.basePath);
  const board = createBullBoard({
    queues: [],
    serverAdapter,
    options: { uiConfig: config.uiConfig },
  });

  const onWarning = (message: string) => log.warn(message);
  const queues = createQueueFactory({
    client,
    readOnly: config.readOnly,
    queueOptions: config.queueOptions,
    onWarning,
  });
  const registry = new QueueRegistry({ board, createQueue: queues.createQueue, onWarning });

  const scan = async () => {
    const discovered = config.queueNames
      ? (
          await Promise.all(
            config.prefixes.map((prefix) => probeQueues(client, prefix, config.queueNames!))
          )
        ).flat()
      : await discoverQueues(client, config.prefixes);

    await registry.sync(discovered);

    return discovered.length;
  };

  const count = await scan();
  const server = await startServer(config, { serverAdapter });

  log.log(`bull-board listening on ${server.url}`);
  log.log(`Redis:  ${config.redisUrl}`);
  log.log(`Prefix: ${config.prefixes.join(', ')}`);
  if (count === 0) {
    log.log(
      `No queues found under ${config.prefixes.join(', ')} yet. ` +
        (config.scanInterval > 0 ? 'Watching for new ones.' : 'Scanning was set to run once.')
    );
  }

  const timer =
    config.scanInterval > 0
      ? setInterval(() => {
          scan().catch((error) => log.warn(`Rescan failed: ${error.message}`));
        }, config.scanInterval * 1000)
      : undefined;
  timer?.unref();

  return {
    url: server.url,
    close: async () => {
      if (timer) clearInterval(timer);
      await server.close();
      await registry.close();
      await queues.close();
      await client.quit();
    },
  };
}
