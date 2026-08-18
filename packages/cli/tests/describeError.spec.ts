/// <reference lib="es2022.error" />
import { describeError } from '../src/index';

describe('describeError', () => {
  it('returns the message of a plain Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('joins the messages of an AggregateError with entries', () => {
    const error = new AggregateError(
      [new Error('connect ECONNREFUSED ::1:1'), new Error('connect ECONNREFUSED 127.0.0.1:1')],
      ''
    );

    expect(describeError(error)).toBe(
      'connect ECONNREFUSED ::1:1; connect ECONNREFUSED 127.0.0.1:1'
    );
  });

  it('falls back to the error itself for an AggregateError with no entries', () => {
    const error = new AggregateError([], '');

    expect(describeError(error)).toBe(String(error));
    expect(describeError(error)).not.toBe('');
  });
});
