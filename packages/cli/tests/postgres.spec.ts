import {
  SchemaMigrationRequiredError,
  SchemaVersionMismatchError,
  UnsupportedPostgresVersionError,
  type PostgresConnection,
} from 'bullmq-v6';
import { explainOpenError } from '../src/postgres';

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
