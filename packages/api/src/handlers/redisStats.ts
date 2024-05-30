import { parse as parseRedisInfo } from 'redis-info';
import { BullBoardRequest, ControllerHandlerReturnType, RedisStats } from '../../typings/app';
import { BaseAdapter } from '../queueAdapters/base';

async function getStats(queue: BaseAdapter): Promise<RedisStats> {
  const redisInfoRaw = await queue.getRedisInfo();
  const redisInfo = parseRedisInfo(redisInfoRaw);

  return {
    version: redisInfo.redis_version,
    mode: redisInfo.redis_mode,
    port: +redisInfo.tcp_port,
    os: redisInfo.os,
    uptime: +redisInfo.uptime_in_seconds,
    memory: {
      total: +redisInfo.total_system_memory || +redisInfo.maxmemory,
      used: +redisInfo.used_memory,
      fragmentationRatio: +redisInfo.mem_fragmentation_ratio,
      peak: +redisInfo.used_memory_peak,
    },
    clients: {
      connected: +redisInfo.connected_clients,
      blocked: +redisInfo.blocked_clients,
    },
  };
}

export async function redisStatsHandler({
  queues: bullBoardQueues,
}: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  const pairs = [...bullBoardQueues.values()];

  const body = pairs.length > 0 ? await getStats(pairs[0]) : {};

  return {
    body,
  };
}
