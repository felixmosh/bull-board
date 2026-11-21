import {
  SchemaMigrationRequiredError,
  SchemaVersionMismatchError,
  UnsupportedPostgresVersionError,
  type PostgresConnection,
} from 'bullmq-v6';
import { connectionConfig, explainOpenError, poolSizeFor } from '../src/postgres';

function fakeConnection(answer: (sql: string) => unknown[]): PostgresConnection {
  return {
    pool: { query: async (sql: string) => ({ rows: answer(sql) }) },
  } as unknown as PostgresConnection;
}

const modernServer = (sql: string) =>
  sql.includes('server_version')
    ? [{ num: 170000, version: '17.0' }]
    : [{ schema: 'bullmq' }, { schema: 'tenant_b' }];

describe('explainOpenError', () => {
  it('lists the schemas that do have BullMQ tables when the one asked for has none', async () => {
    const error = await explainOpenError(
      new SchemaMigrationRequiredError('bullmqq'),
      fakeConnection(modernServer)
    );

    expect(error.message).toContain('Schema "bullmqq" has no BullMQ tables.');
    expect(error.message).toContain('Schemas in this database that have them: bullmq, tenant_b.');
  });

  it('points at the database name when no schema has BullMQ tables', async () => {
    const error = await explainOpenError(
      new SchemaMigrationRequiredError('bullmq'),
      fakeConnection((sql) => (sql.includes('server_version') ? modernServer(sql) : []))
    );

    expect(error.message).toContain('Check the database name in the URL');
  });

  it('blames the server version, not the schema, on a PostgreSQL older than 13', async () => {
    const error = await explainOpenError(
      new SchemaMigrationRequiredError('bullmq'),
      fakeConnection((sql) =>
        sql.includes('server_version') ? [{ num: 120022, version: '12.22' }] : []
      )
    );

    expect(error.message).toBe(
      'PostgreSQL 12.22 is older than 13, the oldest version BullMQ supports. Upgrade PostgreSQL.'
    );
  });

  it('drops the BullMQ advice a CLI user cannot follow from version errors', async () => {
    const tooOld = await explainOpenError(
      new UnsupportedPostgresVersionError('12.22', 13),
      fakeConnection(modernServer)
    );
    const tooNew = await explainOpenError(
      new SchemaVersionMismatchError(7, 6),
      fakeConnection(modernServer)
    );

    expect(tooOld.message).not.toContain('skipVersionCheck');
    expect(tooNew.message).toContain('Upgrade @bull-board/cli');
  });

  it('names the grants a user without access to the schema needs', async () => {
    const denied = Object.assign(new Error('permission denied for schema bullmq'), {
      code: '42501',
    });

    const error = await explainOpenError(denied, fakeConnection(modernServer));

    expect(error.message).toContain('needs USAGE on the schema and SELECT on its tables');
  });
});

describe('poolSizeFor', () => {
  it('keeps the whole CLI within ten connections until each schema is down to one', () => {
    expect([1, 2, 3, 5, 10, 25].map(poolSizeFor)).toEqual([5, 5, 3, 2, 1, 1]);
  });
});

describe('connectionConfig', () => {
  it('moves the URL options into the config, where BullMQ adds its search_path to them', () => {
    const config = connectionConfig(
      'postgres://u:p%40ss@db:5432/app?sslmode=verify-full&options=-c%20statement_timeout%3D5000',
      'tenant_a',
      3
    );

    expect(config.options).toBe('-c statement_timeout=5000');
    expect(config.connectionString).toBe('postgres://u:p%40ss@db:5432/app?sslmode=verify-full');
  });

  it('leaves a URL without options untouched', () => {
    const url = 'postgres:///app?host=%2Fvar%2Frun%2Fpostgresql';

    expect(connectionConfig(url, 'bullmq', 5)).toMatchObject({
      connectionString: url,
      options: undefined,
    });
  });
});
