import { clusterInfo, isCluster } from '../../src/queueAdapters/clusterInfo';

function node(fields: Record<string, string | number>) {
  return {
    info: async () =>
      ['# Server', ...Object.entries(fields).map(([key, value]) => `${key}:${value}`)].join('\r\n'),
  };
}

function fakeCluster(...nodes: ReturnType<typeof node>[]) {
  return { nodes: () => nodes };
}

function parse(info: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (info ?? '').split('\r\n')) {
    const at = line.indexOf(':');
    if (at > 0) out[line.slice(0, at)] = line.slice(at + 1);
  }

  return out;
}

describe('clusterInfo', () => {
  it('tells a cluster client from a plain one', () => {
    expect(isCluster({ nodes: () => [] })).toBe(true);
    expect(isCluster({ info: async () => '' })).toBe(false);
    expect(isCluster(null)).toBe(false);
  });

  it('sums the fields that only describe the cluster once added up', async () => {
    const merged = parse(
      await clusterInfo(
        fakeCluster(
          node({
            used_memory: 100,
            used_memory_peak: 150,
            connected_clients: 3,
            blocked_clients: 1,
          }),
          node({
            used_memory: 200,
            used_memory_peak: 250,
            connected_clients: 4,
            blocked_clients: 0,
          }),
          node({
            used_memory: 300,
            used_memory_peak: 350,
            connected_clients: 5,
            blocked_clients: 2,
          })
        )
      )
    );

    expect(merged.used_memory).toBe('600');
    expect(merged.used_memory_peak).toBe('750');
    expect(merged.connected_clients).toBe('12');
    expect(merged.blocked_clients).toBe('3');
  });

  it('reports the youngest node as the uptime, since the cluster is only as old as that', async () => {
    const merged = parse(
      await clusterInfo(
        fakeCluster(
          node({ uptime_in_seconds: 90000, uptime_in_days: 1 }),
          node({ uptime_in_seconds: 120, uptime_in_days: 0 })
        )
      )
    );

    expect(merged.uptime_in_seconds).toBe('120');
    expect(merged.uptime_in_days).toBe('0');
  });

  it('keeps the fields every node agrees on, and counts the masters', async () => {
    const merged = parse(
      await clusterInfo(
        fakeCluster(
          node({ redis_version: '7.4.1', redis_mode: 'cluster', os: 'Linux', used_memory: 10 }),
          node({ redis_version: '7.4.1', redis_mode: 'cluster', os: 'Linux', used_memory: 20 })
        )
      )
    );

    expect(merged.redis_version).toBe('7.4.1');
    expect(merged.redis_mode).toBe('cluster');
    expect(merged.os).toBe('Linux');
    expect(merged.cluster_known_nodes).toBe('2');
  });

  it('skips a field no node reports rather than writing NaN', async () => {
    const merged = parse(await clusterInfo(fakeCluster(node({ used_memory: 10 }))));

    expect(merged).not.toHaveProperty('maxmemory');
    expect(merged.used_memory).toBe('10');
  });

  it('answers null when the client knows of no master', async () => {
    expect(await clusterInfo(fakeCluster())).toBeNull();
  });
});
