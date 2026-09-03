import { describeConnection, maskRedisUrl } from '../src/connectionState';

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

describe('describeConnection', () => {
  it('masks the password of a URL connection', () => {
    expect(
      describeConnection({ mode: 'url', url: 'redis://user:hunter2@host:6379', options: {} })
    ).toBe('redis://user:***@host:6379');
  });

  it('names the master group and every sentinel', () => {
    expect(
      describeConnection({
        mode: 'sentinel',
        options: {
          name: 'mymaster',
          sentinels: [
            { host: 'a.example', port: 26379 },
            { host: 'b.example', port: 26380 },
          ],
        },
      })
    ).toBe('sentinel://mymaster@a.example:26379,b.example:26380');
  });

  it('brackets an IPv6 sentinel host so its port stays readable', () => {
    expect(
      describeConnection({
        mode: 'sentinel',
        options: { name: 'mymaster', sentinels: [{ host: '::1', port: 26379 }] },
      })
    ).toBe('sentinel://mymaster@[::1]:26379');
  });

  it('never leaks a password from an options connection', () => {
    const described = describeConnection({
      mode: 'options',
      options: { host: 'example.com', port: 6380, password: 'hunter2' },
    });

    expect(described).toBe('redis://example.com:6380');
    expect(described).not.toContain('hunter2');
  });
});
