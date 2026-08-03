import { parse as parseRedisInfo } from 'redis-info';
import { BullBoardRequest, ControllerHandlerReturnType, RedisStats } from '../../typings/app';
import { DATASTORES } from '../constants/datastores';
import { errorResponse } from '../errors';
import { BaseAdapter } from '../queueAdapters/base';

async function getStats(queue: BaseAdapter): Promise<RedisStats | null> {
  const redisInfoRaw = await queue.getRedisInfo();

  // No `INFO` means the queue is not on Redis, which only BullMQ v6 can manage. Its own
  // datastore answers a smaller set of the same questions.
  if (redisInfoRaw === null) {
    return queue.getDatastoreStats();
  }

  const redisInfo = parseRedisInfo(redisInfoRaw);

  return {
    backend: DATASTORES.redis,
    version: redisInfo.redis_version,
    mode: redisInfo.redis_mode,
    port: +redisInfo.tcp_port,
    os: redisInfo.os,
    uptime: +redisInfo.uptime_in_seconds,
    memory: {
      total: +redisInfo.maxmemory || +redisInfo.total_system_memory,
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
  uiConfig,
}: BullBoardRequest): Promise<ControllerHandlerReturnType> {
  if (uiConfig.hideRedisDetails) {
    return {
      status: 403,
      body: 'Forbidden',
    };
  }

  const pairs = [...bullBoardQueues.values()];

  if (pairs.length === 0) {
    return { body: {} };
  }

  const body = await getStats(pairs[0]);

  // A datastore that is neither Redis nor one we can question.
  if (body === null) {
    return errorResponse(404, 'ERRORS.REDIS_STATS_UNAVAILABLE');
  }

  return {
    body,
  };
}
