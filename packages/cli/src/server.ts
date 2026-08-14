import type { Server } from 'node:http';
import type { ExpressAdapter } from '@bull-board/express';
import express, { type Express } from 'express';
import { basicAuth } from './auth';
import type { CliConfig } from './config/types';
import type { ConnectionState } from './connectionState';
import { statusHandler, STATUS_PATH, unavailableGate } from './unavailableGate';

export interface RunningServer {
  app: Express;
  url: string;
  close(): Promise<void>;
  /** Forces every open socket (idle keep-alives and in-flight requests alike) closed.
   * `close()` alone waits for them to finish on their own, which during a Redis outage
   * can mean forever: a request parked on ioredis's offline queue never completes. */
  closeAllConnections(): void;
}

export async function startServer(
  config: CliConfig,
  {
    serverAdapter,
    getConnectionState,
  }: { serverAdapter: ExpressAdapter; getConnectionState?: () => ConnectionState }
): Promise<RunningServer> {
  const app = express();

  if (config.auth) {
    app.use(basicAuth(config.auth));
  }

  // Both mounted after auth: the diagnostic page names the Redis URL and the status
  // endpoint mirrors it as JSON, and neither should be readable by someone the operator
  // has locked out.
  if (getConnectionState) {
    app.get(STATUS_PATH, statusHandler(getConnectionState));
    app.use(unavailableGate(getConnectionState, { apiPrefix: `${config.basePath}/api` }));
  }

  app.use(config.basePath || '/', serverAdapter.getRouter());

  // Express wraps this callback in `once()` and registers it as both the 'listening' and
  // the 'error' handler (`node_modules/express/lib/application.js`), calling it with an
  // error on failure (EADDRINUSE, EACCES, ...) and with no arguments on success. A separate
  // `.on('error', reject)` attached after the fact never runs first: it would fire on an
  // already-settled promise, and reading only the successful branch here previously made a
  // failed bind look like a "listening" banner that then served nothing.
  const server = await new Promise<Server>((resolve, reject) => {
    const listening = app.listen(config.port, config.host, (error?: Error) =>
      error ? reject(error) : resolve(listening)
    );
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
    closeAllConnections: () => server.closeAllConnections(),
  };
}
