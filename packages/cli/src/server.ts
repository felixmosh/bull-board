import type { Server } from 'node:http';
import type { ExpressAdapter } from '@bull-board/express';
import express, { type Express } from 'express';
import { basicAuth } from './auth';
import type { CliConfig } from './config/types';

export interface RunningServer {
  app: Express;
  url: string;
  close(): Promise<void>;
}

export async function startServer(
  config: CliConfig,
  { serverAdapter }: { serverAdapter: ExpressAdapter }
): Promise<RunningServer> {
  const app = express();

  if (config.auth) {
    app.use(basicAuth(config.auth));
  }

  app.use(config.basePath || '/', serverAdapter.getRouter());

  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(config.port, config.host, () => resolve(listening));
    listening.on('error', reject);
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;

  return {
    app,
    url: `http://${config.host}:${port}${config.basePath}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      ),
  };
}
