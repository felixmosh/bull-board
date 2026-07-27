import { errorHandler } from '@bull-board/api/dist/handlers/error';

describe('errorHandler', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV;
  });

  const bodyOf = (err: Error & { statusCode?: any }) =>
    errorHandler(err).body as Record<string, any>;

  it('uses the error statusCode when present', () => {
    const err = Object.assign(new Error('not found'), { statusCode: 404 as const });
    const result = errorHandler(err);
    expect(result.status).toBe(404);
    expect((result.body as Record<string, any>).message).toBe('not found');
    expect((result.body as Record<string, any>).error).toEqual({
      key: 'ERRORS.INTERNAL_SERVER_ERROR',
    });
  });

  it('defaults to 500 when no statusCode is set', () => {
    const result = errorHandler(new Error('boom'));
    expect(result.status).toBe(500);
  });

  it('includes the stack trace only in development', () => {
    process.env.NODE_ENV = 'development';
    const err = new Error('with stack');
    expect(bodyOf(err).details).toBe(err.stack);
  });

  it('omits the stack trace outside development', () => {
    process.env.NODE_ENV = 'production';
    expect(bodyOf(new Error('no stack')).details).toBeUndefined();
  });
});
