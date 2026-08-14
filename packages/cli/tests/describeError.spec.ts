/// <reference lib="es2022.error" />
import { describeError } from '../src/index';

// Direct, environment-independent coverage. The e2e "unreachable Redis" test in cli.spec.ts
// only reaches the AggregateError-with-entries branch, and only because this machine
// resolves "localhost" to both `::1` and `127.0.0.1` (IPv6 loopback present); on a runner
// without IPv6, `error.message` is populated directly by Node and the e2e test would pass
// whether or not this function's fallback exists. These tests exercise all three branches
// directly, with no dependency on the host's network configuration.
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
