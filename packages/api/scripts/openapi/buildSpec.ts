import fs from 'fs';
import path from 'path';
import { toJsonSchema } from '@valibot/to-json-schema';
import type * as v from 'valibot';
import { appRoutes, buildHistoryRoutes } from '../../dist/routes';
import { domainSchemas } from '../../dist/schemas/domain';
import { requestSchemas } from '../../dist/schemas/requests';
import { responseSchemas } from '../../dist/schemas/responses';
import type { AppControllerRoute, MetricsHistoryProvider, RouteSpec } from '../../typings/app';

export const API_CONTRACT_VERSION = '1.0.0';

const PACKAGE_ROOT = path.resolve(__dirname, '../..');
const DOCS_ORIGIN = 'https://felixmosh.github.io/bull-board';

export const OVERVIEW_PATH = path.join(PACKAGE_ROOT, 'scripts/openapi/api-overview.md');

export function readOverview(): string {
  return fs.readFileSync(OVERVIEW_PATH, 'utf8').trimEnd();
}

type JsonSchema = Record<string, any>;

type SchemaMap = Record<string, v.GenericSchema>;

const SCHEMA_SOURCES: { schemas: SchemaMap; typeMode: 'input' | 'output' }[] = [
  { schemas: domainSchemas as SchemaMap, typeMode: 'output' },
  { schemas: responseSchemas as SchemaMap, typeMode: 'output' },
  { schemas: requestSchemas as SchemaMap, typeMode: 'input' },
];

function rewriteRefs<T>(node: T): T {
  if (Array.isArray(node)) {
    return node.map(rewriteRefs) as T;
  }
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) =>
        key === '$ref' && typeof value === 'string'
          ? [key, value.replace('#/$defs/', '#/components/schemas/')]
          : [key, rewriteRefs(value)]
      )
    ) as T;
  }
  return node;
}

function collectDefinitions(): Record<string, JsonSchema> {
  const merged: Record<string, JsonSchema> = {};
  const definitions = { ...domainSchemas, ...responseSchemas, ...requestSchemas } as SchemaMap;

  for (const source of SCHEMA_SOURCES) {
    for (const [name, schema] of Object.entries(source.schemas)) {
      const generated = toJsonSchema(schema, {
        definitions,
        typeMode: source.typeMode,
        errorMode: 'ignore',
      }) as JsonSchema;

      const emitted = (generated.$defs ?? {}) as Record<string, JsonSchema>;
      const body = emitted[name] ?? stripMeta(generated);

      const existing = merged[name];
      if (existing && JSON.stringify(existing) !== JSON.stringify(body)) {
        throw new Error(
          `Schema "${name}" is generated differently by two sources. Rename one of the types.`
        );
      }
      merged[name] = body;
    }
  }

  return rewriteRefs(merged);
}

function stripMeta(schema: JsonSchema): JsonSchema {
  const { $schema, $defs, $ref, ...rest } = schema;
  void $schema;
  void $defs;
  void $ref;
  return rest;
}

function toOpenApiPath(route: string): string {
  return route.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function pathParameters(route: string): JsonSchema[] {
  return [...route.matchAll(/:([A-Za-z0-9_]+)/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
}

function queryParameters(spec: RouteSpec, definitions: Record<string, JsonSchema>): JsonSchema[] {
  if (!spec.query) return [];

  const schema = definitions[spec.query];
  if (!schema) {
    throw new Error(`Route query type "${spec.query}" has no generated schema.`);
  }

  const required: string[] = schema.required ?? [];

  return Object.entries(schema.properties ?? {}).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.includes(name),
    schema: property,
  }));
}

function operation(
  route: AppControllerRoute,
  method: string,
  routePath: string,
  definitions: Record<string, JsonSchema>
): JsonSchema {
  const { spec } = route;
  const parameters = [...pathParameters(routePath), ...queryParameters(spec, definitions)];

  const op: JsonSchema = {
    operationId: operationId(method, toOpenApiPath(routePath)),
    summary: spec.summary,
    tags: [tagFor(routePath)],
  };

  if (spec.availableWhen) {
    op.description = `Available only when: ${spec.availableWhen}`;
  }

  if (parameters.length > 0) {
    op.parameters = parameters;
  }

  if (spec.body) {
    const bodySchema = definitions[spec.body];
    if (!bodySchema) {
      throw new Error(`Route body type "${spec.body}" has no generated schema.`);
    }
    op.requestBody = {
      required: (bodySchema.required ?? []).length > 0,
      content: {
        'application/json': { schema: { $ref: `#/components/schemas/${spec.body}` } },
      },
    };
  }

  const successStatus = spec.successStatus ?? 200;

  op.responses = {
    [String(successStatus)]:
      successStatus === 204
        ? { description: 'Success. The response has no body.' }
        : {
            description: 'Success.',
            content: {
              'application/json': { schema: { $ref: `#/components/schemas/${spec.response}` } },
            },
          },
    default: {
      description: 'The call was rejected or failed.',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/ErrorResponseBody' } },
      },
    },
  };

  return op;
}

const TAGS = [
  {
    name: 'Queues',
    description:
      'Board-level and per-queue operations. `GET /api/queues` is the one the dashboard polls: ' +
      'it returns counts for every queue the request may see, and the jobs of only the queue ' +
      'named in `activeQueue`, paged by `page` and `jobsPerPage`. Everything else here acts on a ' +
      'single queue named in the path, and is refused with **405** when that queue was ' +
      'registered read-only.',
  },
  {
    name: 'Jobs',
    description:
      'Reads and mutations for one job, addressed by its queue and id. Removing a job that is ' +
      'the pending run of a job scheduler is refused with **400** and the ' +
      '`JOB_BELONGS_TO_JOB_SCHEDULER` code, because deleting it alone would leave the schedule ' +
      'registered but unable to fire again.',
  },
  {
    name: 'Job schedulers',
    description:
      'Repeatable job definitions, meaning the schedule itself rather than the runs it produces. ' +
      'Listing spans every visible queue unless you name one. Editing a schedule replaces it, so ' +
      'a body that sets neither a cron pattern nor an interval is rejected.',
  },
  {
    name: 'Metrics history',
    description:
      'Long-retention counter and latency history. These routes exist only on a board configured ' +
      'with a `historyProvider`, and each one individually only when the provider implements the ' +
      'matching capability, so on a board without one they are not mounted and answer **404**.',
  },
  {
    name: 'Datastore',
    description:
      "Statistics for the datastore behind the board's first registered queue. Answers **404** " +
      'when that queue is backed by something other than Redis that cannot report them, and ' +
      '**403** when the board sets `hideRedisDetails`.',
  },
];

function tagFor(routePath: string): string {
  if (routePath.startsWith('/api/metrics')) return 'Metrics history';
  if (routePath.startsWith('/api/redis')) return 'Datastore';
  if (routePath.includes('/job-schedulers')) return 'Job schedulers';
  if (/\/:jobId(\/|$)/.test(routePath)) return 'Jobs';
  return 'Queues';
}

function operationId(method: string, routePath: string): string {
  const segments = routePath
    .replace(/^\/api\//, '')
    .split('/')
    .map((segment) =>
      segment.startsWith('{')
        ? `By${segment.slice(1, -1).replace(/^./, (c) => c.toUpperCase())}`
        : segment.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    );

  return (
    method +
    segments
      .map((segment) => segment.replace(/^./, (c) => c.toUpperCase()))
      .join('')
      .replace(/[^A-Za-z0-9]/g, '')
  );
}

const HISTORY_STUB: MetricsHistoryProvider = {
  getHistory: async () => [],
  getLatency: async () => [],
  getUsage: async () => ({}) as any,
  purge: async () => ({}) as any,
};

export function allRoutes(): AppControllerRoute[] {
  return [
    ...appRoutes.api,
    ...buildHistoryRoutes(HISTORY_STUB, { hasUsage: true, canPurge: true, hasLatency: true }),
  ];
}

export function buildSpec(): JsonSchema {
  const definitions = collectDefinitions();
  const paths: Record<string, JsonSchema> = {};

  for (const route of allRoutes()) {
    const routePaths = Array.isArray(route.route) ? route.route : [route.route];
    const methods = Array.isArray(route.method) ? route.method : [route.method];

    for (const routePath of routePaths) {
      const openApiPath = toOpenApiPath(routePath);
      paths[openApiPath] ??= {};

      for (const method of methods) {
        if (paths[openApiPath][method]) {
          throw new Error(`Duplicate operation ${method.toUpperCase()} ${openApiPath}.`);
        }
        paths[openApiPath][method] = operation(route, method, routePath, definitions);
      }
    }
  }

  const used = new Set(
    Object.values(paths).flatMap((operations) =>
      Object.values(operations).flatMap((operation: JsonSchema) => operation.tags as string[])
    )
  );
  const unknown = [...used].filter((tag) => !TAGS.some((known) => known.name === tag));
  if (unknown.length > 0) {
    throw new Error(`Routes are tagged with undescribed groups: ${unknown.join(', ')}.`);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'bull-board HTTP API',
      version: API_CONTRACT_VERSION,
      description: readOverview().replace(/\]\(\/(?!\/)/g, `](${DOCS_ORIGIN}/`),
    },
    tags: TAGS.filter((tag) => used.has(tag.name)),
    paths,
    components: { schemas: definitions },
  };
}
