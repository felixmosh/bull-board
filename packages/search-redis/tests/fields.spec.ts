import type { Job } from 'bullmq';
import { resolveFields } from '../src/fields';

const job = (data: unknown, extra: Record<string, unknown> = {}) =>
  ({ name: 'n', data, ...extra }) as unknown as Job;

const valuesOf = (definition: Parameters<typeof resolveFields>[0][string], target: Job) =>
  resolveFields({ f: definition })[0].values(target);

describe('resolveFields', () => {
  it('resolves paths, functions and objects', () => {
    expect(valuesOf('data.tenant', job({ tenant: 'acme' }))).toEqual(['acme']);
    expect(valuesOf('data.n', job({ n: 7 }))).toEqual(['7']);
    expect(valuesOf('data.b', job({ b: true }))).toEqual(['true']);
    expect(valuesOf('data.l', job({ l: ['a', 'b', null, {}] }))).toEqual(['a', 'b']);
    expect(valuesOf((j) => j.name, job({}))).toEqual(['n']);
    expect(valuesOf({ extract: (j) => j.data.x }, job({ x: 'y' }))).toEqual(['y']);
    expect(valuesOf({ path: 'data.x' }, job({ x: 'y' }))).toEqual(['y']);
  });

  it('produces nothing for values that are not scalars', () => {
    expect(valuesOf('data.v', job({ v: NaN }))).toEqual([]);
    expect(valuesOf('data.v', job({ v: Infinity }))).toEqual([]);
    expect(valuesOf('data.v', job({ v: null }))).toEqual([]);
    expect(valuesOf('data.v', job({ v: undefined }))).toEqual([]);
    expect(valuesOf('data.v', job({ v: {} }))).toEqual([]);
    expect(valuesOf('data.v', job({ v: [] }))).toEqual([]);
    expect(valuesOf('data.a.b.c', job({ a: null }))).toEqual([]);
    expect(valuesOf('data.a.b', job({ a: 'str' }))).toEqual([]);
  });

  it('normalizes values and exposes the normalizer for queries', () => {
    const [field] = resolveFields({
      email: { path: 'data.email', normalize: (v: string) => v.toLowerCase() },
    });

    expect(field.values(job({ email: 'ACME@X.io' }))).toEqual(['acme@x.io']);
    expect(field.normalize('ACME')).toBe('acme');
  });

  it('keeps definition order and collapses duplicates', () => {
    const fields = resolveFields({ b: 'name', a: 'data.x', c: 'data.y' });

    expect(fields.map((f) => f.name)).toEqual(['b', 'a', 'c']);
    expect(valuesOf('data.x', job({ x: ['x', 'x'] }))).toEqual(['x']);
    expect(valuesOf('data.x', job({ x: ['Ab', 'ab'] }))).toEqual(['Ab', 'ab']);
  });
});
