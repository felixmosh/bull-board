import { DEFAULT_PREFIX, searchKeys } from '../src/keys';

const tagOf = (key: string) => /\{([^}]*)\}/.exec(key)![1];

const allKeys = (keys: ReturnType<typeof searchKeys>) => [
  keys.value('data.tenant', 'acme'),
  keys.job('1'),
  keys.all,
  keys.retry,
  keys.checkpoint,
  keys.sweep,
  keys.heartbeat,
  keys.stats,
];

describe('searchKeys', () => {
  it('puts one queue in one slot and two queues apart', () => {
    const a = allKeys(searchKeys('p', '{bull}:a'));
    const b = allKeys(searchKeys('p', '{bull}:b'));

    expect(new Set(a.map(tagOf)).size).toBe(1);
    expect(new Set(b.map(tagOf)).size).toBe(1);
    expect(tagOf(a[0])).toMatch(/^[0-9a-f]{16}$/);
    expect(tagOf(a[0])).not.toBe(tagOf(b[0]));
  });

  it('never puts a raw value in a key', () => {
    const key = searchKeys(DEFAULT_PREFIX, 'bull:q').value('data.name', 'zażółć gęślą jaźń');

    expect(key).not.toContain('zażółć');
    expect(key).not.toContain(' ');
    expect(key.startsWith(`${DEFAULT_PREFIX}:{`)).toBe(true);
  });
});
