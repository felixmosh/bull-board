import { maskRedisUrl } from '../src/connectionState';

// `state.redisUrl` is rendered into the diagnostic page HTML and mirrored as JSON on the
// status endpoint, both of which can be reachable from outside the machine with no auth
// configured. These tests cover every credential shape the CLI accepts in a Redis URL, plus
// the common case of no credential at all, to prove the mask never corrupts a plain URL.
describe('maskRedisUrl', () => {
  it('masks a userinfo password', () => {
    expect(maskRedisUrl('redis://user:hunter2@host:6379')).toBe('redis://user:***@host:6379');
  });

  it('masks a password given as a query parameter', () => {
    const masked = maskRedisUrl('redis://localhost:6379?password=s3cr3t');

    expect(masked).not.toContain('s3cr3t');
    expect(masked).toBe('redis://localhost:6379?password=***');
  });

  it('masks an auth query parameter', () => {
    const masked = maskRedisUrl('redis://localhost:6379?auth=s3cr3t');

    expect(masked).not.toContain('s3cr3t');
    expect(masked).toBe('redis://localhost:6379?auth=***');
  });

  it('masks both a userinfo password and a query-parameter password at once', () => {
    const masked = maskRedisUrl('redis://user:hunter2@host:6379?password=s3cr3t');

    expect(masked).not.toContain('hunter2');
    expect(masked).not.toContain('s3cr3t');
  });

  it('leaves a URL with no credential at all unchanged', () => {
    expect(maskRedisUrl('redis://localhost:6379')).toBe('redis://localhost:6379');
    expect(maskRedisUrl('redis://localhost:6379/2')).toBe('redis://localhost:6379/2');
  });

  it('leaves a unix socket path unchanged', () => {
    expect(maskRedisUrl('/tmp/redis.sock')).toBe('/tmp/redis.sock');
  });

  it('returns an unparseable URL unchanged rather than throwing', () => {
    expect(maskRedisUrl('not a url')).toBe('not a url');
  });
});
