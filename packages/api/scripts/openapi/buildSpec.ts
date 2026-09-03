import path from 'path';
import { createGenerator } from 'ts-json-schema-generator';
import { appRoutes, buildHistoryRoutes } from '../../dist/routes';
import type { AppControllerRoute, MetricsHistoryProvider, RouteSpec } from '../../typings/app';

export const API_CONTRACT_VERSION = '1.0.0';

const PACKAGE_ROOT = path.resolve(__dirname, '../..');

type JsonSchema = Record<string, any>;

const SCHEMA_SOURCES = [
  { file: 'typings/responses.d.ts', type: 'ResponseSchemas' },
  { file: 'typings/requests.d.ts', type: 'RequestSchemas' },
  { file: 'typings/app.d.ts', type: 'ErrorResponseBody' },
];

function rewriteRefs<T>(node: T): T {
  if (Array.isArray(node)) {
    return node.map(rewriteRefs) as T;
  }
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) =>
        key === '$ref' && typeof value === 'string'
          ? [key, value.replace('#/definitions/', '#/components/schemas/')]
          : [key, rewriteRefs(value)]
      )
    ) as T;
  }
  return node;
}

function collectDefinitions(): Record<string, JsonSchema> {
  const merged: Record<string, JsonSchema> = {};

  for (const source of SCHEMA_SOURCES) {
    const generated = createGenerator({
      path: path.join(PACKAGE_ROOT, source.file),
      tsconfig: path.join(PACKAGE_ROOT, 'tsconfig.json'),
      type: source.type,
      skipTypeCheck: true,
      additionalProperties: false,
    }).createSchema(source.type);

    for (const [name, schema] of Object.entries(generated.definitions ?? {})) {
      const existing = merged[name];
      if (existing && JSON.stringify(existing) !== JSON.stringify(schema)) {
        throw new Error(
          `Schema "${name}" is generated differently by two sources. Rename one of the types.`
        );
      }
      merged[name] = schema as JsonSchema;
    }
  }

  delete merged.ResponseSchemas;
  delete merged.RequestSchemas;

  return rewriteRefs(merged);
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

function tagFor(routePath: string): string {
  if (routePath.startsWith('/api/metrics')) return 'Metrics history';
  if (routePath.startsWith('/api/redis')) return 'Datastore';
  if (routePath.startsWith('/api/job-schedulers')) return 'Job schedulers';
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

  return {
    openapi: '3.1.0',
    info: {
      title: 'bull-board HTTP API',
      version: API_CONTRACT_VERSION,
      description:
        'The JSON API the bull-board dashboard serves under its base path. Generated from the ' +
        'route table in @bull-board/api, so it always matches the routes the board registers.',
    },
    paths,
    components: { schemas: definitions },
  };
}
