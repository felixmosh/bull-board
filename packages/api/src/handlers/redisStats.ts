import { parse as parseRedisInfo } from 'redis-info';
import { BullBoardRequest, ControllerHandlerReturnType, RedisStats } from '../../typings/app';
import { BaseAdapter } from '../queueAdapters/base';

function formatUptime(uptime: number) {
  const date = new Date(uptime * 1000);
  const days = date.getUTCDate() - 1,
    hours = date.getUTCHours(),
    minutes = date.getUTCMinutes(),
    seconds = date.getUTCSeconds();

  // Initialize an array for the uptime.
  const segments = [];

  // Format the uptime string.
  if (days > 0) segments.push(days + ' day' + (days == 1 ? '' : 's'));
  if (hours > 0) segments.push(hours + ' hour' + (hours == 1 ? '' : 's'));
  if (minutes > 0) segments.push(minutes + ' minute' + (minutes == 1 ? '' : 's'));
  if (seconds > 0 && days === 0) segments.push(seconds + ' second' + (seconds == 1 ? '' : 's'));
  return segments.join(', ');
}

async function getStats(queue: BaseAdapter): Promise<RedisStats> {
  const redisInfoRaw = await queue.getRedisInfo();
  const redisInfo = parseRedisInfo(redisInfoRaw);

  return {
    version: redisInfo.redis_version,
    mode: redisInfo.redis_mode,
    port: +redisInfo.tcp_port,
    os: redisInfo.os,
    uptime: formatUptime(+redisInfo.uptime_in_seconds),
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
