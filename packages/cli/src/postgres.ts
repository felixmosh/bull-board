import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import {
  PostgresConnection,
  PostgresQueueBackend,
  Queue,
  MINIMUM_POSTGRES_VERSION,
  SchemaMigrationRequiredError,
  SchemaVersionMismatchError,
  UnsupportedPostgresVersionError,
  type BackendFactory,
  type PostgresConnectionOptions,
} from 'bullmq-v6';
import { describeConnection, RETRY_INTERVAL_MS } from './connectionState';
import type { Datastore, DatastoreDeps } from './datastore';
import { describeError } from './describeError';
import type { DiscoveredQueue } from './discovery';
import { adapterOptions } from './queueFactory';

const CONNECT_TIMEOUT_MS = 10000;
const FIRST_ATTEMPT_WAIT_MS = 2000;
const POOL_SIZE = 5;
const INSUFFICIENT_PRIVILEGE = '42501';
const REPEAT_WARNING_AFTER_MS = 60000;

type AdapterQueue = ConstructorParameters<typeof BullMQAdapter>[0];

const DISCOVER_QUEUES = `
  WITH RECURSIVE job_queue AS (
    (SELECT queue FROM job ORDER BY queue LIMIT 1)
    UNION ALL
    SELECT (SELECT job.queue FROM job WHERE job.queue > job_queue.queue ORDER BY job.queue LIMIT 1)
    FROM job_queue
    WHERE job_queue.queue IS NOT NULL
  )
  SELECT queue FROM job_queue WHERE queue IS NOT NULL
  UNION SELECT queue FROM meta
  UNION SELECT queue FROM scheduler
  ORDER BY queue
`;

const SCHEMAS_WITH_BULLMQ_TABLES = `
  SELECT table_schema AS schema
  FROM information_schema.tables
  WHERE table_name IN ('job', 'meta', 'migration')
  GROUP BY table_schema
  HAVING count(*) = 3
  ORDER BY table_schema
`;

const SERVER_VERSION = `
  SELECT current_setting('server_version_num')::int AS num,
         current_setting('server_version') AS version
`;

function unsupportedVersion(serverVersion: string): Error {
  return new Error(
    `PostgreSQL ${serverVersion} is older than ${MINIMUM_POSTGRES_VERSION}, the oldest version ` +
      'BullMQ supports. Upgrade PostgreSQL.'
  );
}

export async function explainOpenError(
  error: Error,
  connection: PostgresConnection
): Promise<Error> {
  if ((error as { code?: string }).code === INSUFFICIENT_PRIVILEGE) {
    return new Error(
      `${error.message}. The user in the URL needs USAGE on the schema and SELECT on its ` +
        'tables, plus INSERT, UPDATE and DELETE for anything but --read-only.'
    );
  }
  if (error instanceof UnsupportedPostgresVersionError)
    return unsupportedVersion(error.serverVersion);
  if (error instanceof SchemaVersionMismatchError) {
    return new Error(
      `The schema was migrated by BullMQ ${error.minimumClientVersion}, and this bull-board ` +
        `reads it with BullMQ ${error.clientVersion}. Upgrade @bull-board/cli, or use an image ` +
        'tag that is at least as new as your app.'
    );
  }
  if (!(error instanceof SchemaMigrationRequiredError)) return error;

  const server = await connection.pool
    .query<{ num: number; version: string }>(SERVER_VERSION)
    .then(({ rows }) => rows[0])
    .catch(() => undefined);
  if (server && server.num < MINIMUM_POSTGRES_VERSION * 10000) {
    return unsupportedVersion(server.version);
  }

  const elsewhere = await connection.pool
    .query<{ schema: string }>(SCHEMAS_WITH_BULLMQ_TABLES)
    .then(({ rows }) => rows.map((row) => row.schema))
    .catch(() => [] as string[]);
  const where =
    elsewhere.length > 0
      ? `Schemas in this database that have them: ${elsewhere.join(', ')}. Check --pg-schema`
      : 'No other schema in this database has them either. Check the database name in the URL';

  return new Error(
    `Schema "${error.schema}" has no BullMQ tables. ${where}, or start your BullMQ app with ` +
      `migrate: true against it first. bull-board never creates them.`
  );
}

export function createPostgresDatastore(
  url: string,
  schemas: string[],
  { readOnly, queueOptions, noRetry, onWarning }: DatastoreDeps
): Datastore {
  const readyListeners: Array<() => void> = [];
  const errorListeners: Array<(error: Error) => void> = [];
  let connections: Map<string, PostgresConnection> | undefined;
  let retryTimer: NodeJS.Timeout | undefined;
  let closed = false;

  const lastWarned = new Map<string, number>();
  const warnConnectionError = (error: Error) => {
    const message = describeError(error);
    const now = Date.now();
    if (now - (lastWarned.get(message) ?? -Infinity) < REPEAT_WARNING_AFTER_MS) return;
    lastWarned.set(message, now);
    onWarning(
      `A PostgreSQL connection dropped: ${message}. bull-board opens a new one on the next request.`
    );
  };

  const closeAll = (list: Iterable<PostgresConnection>) =>
    Promise.allSettled([...list].map((connection) => connection.close()));

  const open = async () => {
    const fresh = schemas.map(
      (schema) =>
        new PostgresConnection({
          connectionString: url,
          schema,
          connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
          max: POOL_SIZE,
        })
    );
    const results = await Promise.allSettled(
      fresh.map((connection) => connection.waitUntilReady())
    );
    const failed = results.findIndex((result) => result.status === 'rejected');
    if (failed !== -1) {
      const error = await explainOpenError(
        (results[failed] as PromiseRejectedResult).reason as Error,
        fresh[failed]
      );
      await closeAll(fresh);
      throw error;
    }
    if (closed) {
      await closeAll(fresh);
      return;
    }

    for (const connection of fresh) {
      connection.on('error', warnConnectionError);
    }
    connections = new Map(schemas.map((schema, index) => [schema, fresh[index]]));
  };

  const scheduleRetry = () => {
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      open().then(
        () => {
          if (!closed) readyListeners.forEach((listener) => listener());
        },
        (error: Error) => {
          if (closed) return;
          errorListeners.forEach((listener) => listener(error));
          scheduleRetry();
        }
      );
    }, RETRY_INTERVAL_MS);
  };

  const connectionFor = (schema: string) => {
    const connection = connections?.get(schema);
    if (!connection) throw new Error(`Not connected to PostgreSQL schema "${schema}" yet.`);

    return connection;
  };

  const shutDown = async () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (connections) await closeAll(connections.values());
  };

  return {
    name: 'PostgreSQL',
    label: describeConnection({ mode: 'postgres', url }),
    namespaceLabel: 'Schema',
    async connect() {
      if (noRetry) return open();

      let answered = false;
      let timer: NodeJS.Timeout | undefined;
      const attempt = open().then(
        () => {
          if (answered && !closed) readyListeners.forEach((listener) => listener());
        },
        (error: Error) => {
          if (closed) return;
          scheduleRetry();
          if (!answered) throw error;
          errorListeners.forEach((listener) => listener(error));
        }
      );
      const slow = new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          answered = true;
          resolve();
        }, FIRST_ATTEMPT_WAIT_MS);
      });

      try {
        await Promise.race([attempt, slow]);
      } finally {
        clearTimeout(timer);
        answered = true;
      }
    },
    isReady: () => connections !== undefined,
    onReady: (listener) => readyListeners.push(listener),
    onError: (listener) => errorListeners.push(listener),
    async discover(namespaces, names) {
      const found: DiscoveredQueue[] = [];
      for (const schema of namespaces) {
        const queues = names
          ? names
          : (await connectionFor(schema).pool.query<{ queue: string }>(DISCOVER_QUEUES)).rows.map(
              (row) => row.queue
            );
        found.push(...queues.map((name) => ({ prefix: schema, name, lib: 'bullmq' as const })));
      }

      return found;
    },
    createQueue(discovered) {
      const connection = connectionFor(discovered.prefix);
      const sharedConnection: BackendFactory<PostgresQueueBackend, PostgresConnectionOptions> = (
        name,
        opts
      ) => new PostgresQueueBackend(connection, name, opts, false);
      const queue = new Queue(
        discovered.name,
        { connection: url, skipMetasUpdate: true },
        sharedConnection
      );

      return {
        // The adapter's typings resolve bullmq to the CLI's v5, but it supports v6 at runtime.
        adapter: new BullMQAdapter(
          queue as unknown as AdapterQueue,
          adapterOptions(discovered.name, readOnly, queueOptions)
        ),
        close: () => queue.close(),
      };
    },
    closeQueues: async () => undefined,
    quit: async () => {
      await shutDown();
    },
    disconnect: () => {
      void shutDown();
    },
  };
}
