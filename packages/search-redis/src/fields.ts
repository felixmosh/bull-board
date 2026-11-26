import type { Job } from 'bullmq';

export type FieldExtractor = (job: Job) => unknown;

export type FieldDefinition =
  | string
  | FieldExtractor
  | { path: string; normalize?: (value: string) => string }
  | { extract: FieldExtractor; normalize?: (value: string) => string };

export interface ResolvedField {
  name: string;
  values(job: Job): string[];
  normalize(value: string): string;
}

const identity = (value: string) => value;

function readPath(job: Job, path: string): unknown {
  let current: unknown = job;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function collect(value: unknown, into: string[]): void {
  if (typeof value === 'string') {
    into.push(value);
  } else if (typeof value === 'number') {
    if (Number.isFinite(value)) into.push(String(value));
  } else if (typeof value === 'boolean') {
    into.push(String(value));
  } else if (Array.isArray(value)) {
    for (const item of value) collect(item, into);
  }
}

function resolveField(name: string, definition: FieldDefinition): ResolvedField {
  let extract: FieldExtractor;
  let normalize = identity;

  if (typeof definition === 'string') {
    extract = (job) => readPath(job, definition);
  } else if (typeof definition === 'function') {
    extract = definition;
  } else {
    normalize = definition.normalize ?? identity;
    extract = 'path' in definition ? (job) => readPath(job, definition.path) : definition.extract;
  }

  return {
    name,
    normalize,
    values(job) {
      const raw: string[] = [];
      collect(extract(job), raw);
      return [...new Set(raw.map(normalize))];
    },
  };
}

export function resolveFields(definitions: Record<string, FieldDefinition>): ResolvedField[] {
  return Object.entries(definitions).map(([name, definition]) => resolveField(name, definition));
}
