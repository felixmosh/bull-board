import type { AppControllerRoute, HTTPMethod } from '@bull-board/api/typings/app';

type TransportRoute = AppControllerRoute<AppControllerRoute['spec']['response'], unknown, unknown>;
type Segment = { kind: 'literal'; value: string } | { kind: 'parameter'; name: string };

export type NormalizedRoute = {
  route: TransportRoute;
  methods: HTTPMethod[];
  paths: Segment[][];
};

export function normalizeRoutes(routes: AppControllerRoute[]): NormalizedRoute[] {
  return routes.map((route) => ({
    route,
    methods: Array.isArray(route.method) ? [...route.method] : [route.method],
    paths: (Array.isArray(route.route) ? route.route : [route.route]).map((pattern) =>
      trimSlash(pattern)
        .split('/')
        .map((segment): Segment =>
          segment.startsWith(':')
            ? { kind: 'parameter', name: segment.slice(1) }
            : { kind: 'literal', value: segment }
        )
    ),
  }));
}

export function matchRoute(
  routes: NormalizedRoute[],
  method: string,
  pathname: string
):
  | { kind: 'matched'; route: TransportRoute; params: Record<string, string> }
  | { kind: 'malformed' }
  | { kind: 'unmatched' } {
  const actual = trimSlash(pathname).split('/');
  const requestMethod = method.toLowerCase();
  for (const candidate of routes) {
    if (
      !candidate.methods.some(
        (method) => method === requestMethod || (method === 'get' && requestMethod === 'head')
      )
    )
      continue;
    for (const expected of candidate.paths) {
      if (expected.length !== actual.length) continue;
      if (
        !expected.every((segment, index) =>
          segment.kind === 'literal' ? segment.value === actual[index] : actual[index].length > 0
        )
      )
        continue;
      const params = new Map<string, string>();
      try {
        expected.forEach((segment, index) => {
          if (segment.kind === 'parameter')
            params.set(segment.name, decodeURIComponent(actual[index]));
        });
      } catch {
        return { kind: 'malformed' };
      }
      return { kind: 'matched', route: candidate.route, params: Object.fromEntries(params) };
    }
  }
  return { kind: 'unmatched' };
}

function trimSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/$/, '') : value;
}
