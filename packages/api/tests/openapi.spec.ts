import fs from 'fs';
import { MARKDOWN_PATH, renderArtifacts, SPEC_PATH } from '../scripts/openapi/artifacts';
import { allRoutes, buildSpec } from '../scripts/openapi/buildSpec';

const REGENERATE = 'Run `yarn workspace @bull-board/api openapi`.';

describe('OpenAPI artifacts', () => {
  const artifacts = renderArtifacts();
  const spec = buildSpec();

  it('has a committed openapi.json matching the route table', () => {
    if (fs.readFileSync(SPEC_PATH, 'utf8') !== artifacts.spec) {
      throw new Error(`packages/api/openapi.json is out of date. ${REGENERATE}`);
    }
  });

  it('has a committed reference page matching the route table', () => {
    if (fs.readFileSync(MARKDOWN_PATH, 'utf8') !== artifacts.markdown) {
      throw new Error(`website/docs/reference/http-api.md is out of date. ${REGENERATE}`);
    }
  });

  it('documents every route the board registers', () => {
    const documented = new Set(
      Object.entries<Record<string, unknown>>(spec.paths).flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => `${method} ${path}`)
      )
    );

    const registered = allRoutes().flatMap((route) => {
      const paths = Array.isArray(route.route) ? route.route : [route.route];
      const methods = Array.isArray(route.method) ? route.method : [route.method];

      return paths.flatMap((path) =>
        methods.map((method) => `${method} ${path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`)
      );
    });

    expect(registered.length).toBeGreaterThan(0);
    expect(registered.filter((operation) => !documented.has(operation))).toEqual([]);
  });

  it('resolves every schema reference it emits', () => {
    const known = new Set(Object.keys(spec.components.schemas));
    const unresolved: string[] = [];

    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== 'object') return;

      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') {
          if (!known.has(value.split('/').pop() as string)) unresolved.push(value);
        } else {
          walk(value);
        }
      }
    };

    walk(spec);

    expect(unresolved).toEqual([]);
  });
});
