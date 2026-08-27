import { Redis } from 'ioredis';
import { MetricsHistoryAdmin } from '../src/HistoryAdmin';
import { MetricsRecorder } from '../src/MetricsRecorder';
import { RedisMetricsHistoryProvider } from '../src/RedisMetricsHistoryProvider';
import { connection } from './connection';

// ioredis v6 enables RESP3 (`protocol: 3`) by default. The three classes that can open their
// own connection force `protocol: 2` on the options-construction path for exact v5 wire parity
// and Redis < 6 support, while letting an explicit caller `protocol` win. These assertions read
// the constructed client's negotiated option -- no server round-trip is needed, so they don't
// depend on the Redis version under test.

// The `redis` field is private; the tests reach it to inspect the resolved options.
const protocolOf = (owner: { redis: Redis }): number | undefined => owner.redis.options.protocol;

describe('RESP2 guardrail on the options-construction path', () => {
  describe('defaults an owned connection to protocol 2', () => {
    it('RedisMetricsHistoryProvider', () => {
      const provider = new RedisMetricsHistoryProvider({ connection });
      expect(protocolOf(provider as unknown as { redis: Redis })).toBe(2);
      provider.disconnect();
    });

    it('MetricsRecorder', () => {
      const recorder = new MetricsRecorder({ queues: [], connection });
      expect(protocolOf(recorder as unknown as { redis: Redis })).toBe(2);
      recorder.stop();
    });

    it('MetricsHistoryAdmin', () => {
      const admin = new MetricsHistoryAdmin({ connection });
      expect(protocolOf(admin as unknown as { redis: Redis })).toBe(2);
      admin.disconnect();
    });
  });

  it('lets an explicit caller protocol win over the default', () => {
    const provider = new RedisMetricsHistoryProvider({
      connection: { ...connection, protocol: 3 },
    });
    expect(protocolOf(provider as unknown as { redis: Redis })).toBe(3);
    provider.disconnect();
  });

  it('does not override the protocol of an injected Redis instance', () => {
    const injected = new Redis({ ...connection, lazyConnect: true, protocol: 3 });
    const provider = new RedisMetricsHistoryProvider({ connection: injected });
    expect(protocolOf(provider as unknown as { redis: Redis })).toBe(3);
    // ownsRedis is false for an injected client, so disconnect() is a no-op -- close it directly.
    injected.disconnect();
  });
});
