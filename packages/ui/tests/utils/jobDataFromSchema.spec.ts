import { jobDataFromSchema } from '../../src/utils/jobDataFromSchema';

describe('jobDataFromSchema', () => {
  it('returns undefined when there is no schema', () => {
    expect(jobDataFromSchema(undefined)).toBeUndefined();
    expect(jobDataFromSchema({})).toBeUndefined();
  });

  it('prefers an explicit schema-level default', () => {
    const schema = {
      type: 'object',
      default: { make: 'Toyota', model: 'Corolla' },
      properties: { make: { type: 'string' }, model: { type: 'string' } },
    };
    expect(jobDataFromSchema(schema)).toEqual({ make: 'Toyota', model: 'Corolla' });
  });

  it('falls back to the first examples entry', () => {
    const schema = {
      type: 'object',
      examples: [{ make: 'Honda' }, { make: 'Ford' }],
      properties: { make: { type: 'string' } },
    };
    expect(jobDataFromSchema(schema)).toEqual({ make: 'Honda' });
  });

  it('builds a typed skeleton from properties when no default is given', () => {
    const schema = {
      type: 'object',
      properties: {
        make: { type: 'string' },
        year: { type: 'number' },
        electric: { type: 'boolean' },
        tags: { type: 'array' },
        meta: { type: 'object' },
      },
    };
    expect(jobDataFromSchema(schema)).toEqual({
      make: '',
      year: 0,
      electric: false,
      tags: [],
      meta: {},
    });
  });

  it('uses per-property defaults inside the skeleton', () => {
    const schema = {
      type: 'object',
      properties: {
        make: { type: 'string', default: 'Tesla' },
        model: { type: 'string' },
      },
    };
    expect(jobDataFromSchema(schema)).toEqual({ make: 'Tesla', model: '' });
  });
});
