import { formatDate, formatRelativeToNow } from '../../src/utils/formatDate';

describe('formatDate', () => {
  const now = new Date();

  it('shows only the time for today', () => {
    const ts = new Date(now);
    ts.setHours(9, 30, 15);
    expect(formatDate(ts, 'en-US')).toBe(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      }).format(ts)
    );
  });

  it('adds the year once the timestamp is outside it', () => {
    const ts = new Date('2019-03-04T08:00:00Z');
    expect(formatDate(ts, 'en-US')).toContain('2019');
  });

  it('lets uiConfig date formats win', () => {
    const ts = new Date('2019-03-04T08:00:00Z');
    expect(formatDate(ts, 'en-US', { full: { year: 'numeric' } })).toBe('2019');
  });
});

describe('formatRelativeToNow', () => {
  const now = Date.parse('2026-07-28T12:00:00Z');

  it('describes a past timestamp', () => {
    expect(formatRelativeToNow(now - 90 * 1000, 'en-US', now)).toBe('2 minutes ago');
  });

  it('describes a future timestamp', () => {
    expect(formatRelativeToNow(now + 3 * 60 * 60 * 1000, 'en-US', now)).toBe('in 3 hours');
  });

  it('scales the unit to the distance', () => {
    expect(formatRelativeToNow(now - 5 * 1000, 'en-US', now)).toBe('5 seconds ago');
    expect(formatRelativeToNow(now + 2 * 24 * 60 * 60 * 1000, 'en-US', now)).toBe('in 2 days');
  });
});
