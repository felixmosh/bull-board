import type { RedisStats } from '@bull-board/api/typings/app';
import { screen, waitFor } from '@testing-library/react';
import { RedisStatsModal } from '../../src/components/RedisStatsModal/RedisStatsModal';
import { createWrapper, render } from '../testUtils';

const redisStats: RedisStats = {
  backend: 'redis',
  version: '7.2.4',
  mode: 'standalone',
  port: 6379,
  os: 'Linux 6.1.0 x86_64',
  uptime: 3600,
  memory: {
    total: 1024 * 1024 * 100,
    used: 1024 * 1024 * 25,
    fragmentationRatio: 1.2,
    peak: 1024 * 1024 * 40,
  },
  clients: { connected: 4, blocked: 0 },
};

// BullMQ v6 on PostgreSQL: no memory figures, no replication mode, and a port worth showing.
const postgresStats: RedisStats = {
  backend: 'postgres',
  version: '17.10',
  port: 5432,
  uptime: 3600,
  clients: { connected: 6, blocked: 1 },
};

function renderStats(stats: RedisStats) {
  const api = { getStats: jest.fn(() => Promise.resolve(stats)) };
  const { Wrapper } = createWrapper({ api });
  render(<RedisStatsModal open onClose={() => {}} />, { wrapper: Wrapper });
  return api;
}

describe('RedisStatsModal', () => {
  describe('on redis', () => {
    it('shows the memory rows', async () => {
      renderStats(redisStats);

      await waitFor(() => expect(screen.getByText('REDIS.VERSION')).toBeTruthy());
      expect(screen.getByText('REDIS.MEMORY_USAGE')).toBeTruthy();
      expect(screen.getByText('REDIS.PEEK_MEMORY')).toBeTruthy();
      expect(screen.getByText('REDIS.FRAGMENTATION_RATIO')).toBeTruthy();
      expect(screen.getByText('REDIS.MODE')).toBeTruthy();
      expect(screen.getByText('REDIS.OS')).toBeTruthy();
    });

    it('keeps its own title and hides the port', async () => {
      renderStats(redisStats);

      await waitFor(() => expect(screen.getByText('REDIS.TITLE')).toBeTruthy());
      expect(screen.queryByText('REDIS.TITLE_POSTGRES')).toBeNull();
      expect(screen.queryByText('REDIS.PORT')).toBeNull();
    });
  });

  describe('on postgres', () => {
    it('drops the rows postgres has no honest answer for', async () => {
      renderStats(postgresStats);

      await waitFor(() => expect(screen.getByText('REDIS.VERSION')).toBeTruthy());
      expect(screen.queryByText('REDIS.MEMORY_USAGE')).toBeNull();
      expect(screen.queryByText('REDIS.PEEK_MEMORY')).toBeNull();
      expect(screen.queryByText('REDIS.FRAGMENTATION_RATIO')).toBeNull();
      expect(screen.queryByText('REDIS.MODE')).toBeNull();
      expect(screen.queryByText('REDIS.OS')).toBeNull();
    });

    it('retitles itself and shows what it can answer', async () => {
      renderStats(postgresStats);

      await waitFor(() => expect(screen.getByText('REDIS.TITLE_POSTGRES')).toBeTruthy());
      expect(screen.queryByText('REDIS.TITLE')).toBeNull();
      expect(screen.getByText('REDIS.PORT')).toBeTruthy();
      expect(screen.getByText('5432')).toBeTruthy();
      expect(screen.getByText('17.10')).toBeTruthy();
      expect(screen.getByText('6')).toBeTruthy();
    });
  });

  // A server older than this change sends no `backend` at all, and could only ever be Redis.
  it('treats a response with no backend field as redis', async () => {
    const { backend: _omitted, ...withoutBackend } = redisStats;
    renderStats(withoutBackend as RedisStats);

    await waitFor(() => expect(screen.getByText('REDIS.TITLE')).toBeTruthy());
    expect(screen.getByText('REDIS.MEMORY_USAGE')).toBeTruthy();
  });
});
