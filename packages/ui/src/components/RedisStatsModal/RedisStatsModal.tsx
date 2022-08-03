import { RedisStats } from '@bull-board/api/typings/app';
import formatBytes from 'pretty-bytes';
import React, { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useInterval } from '../../hooks/useInterval';
import { Modal } from '../Modal/Modal';
import s from './RedisStatsModal.module.css';

const getMemoryUsage = (
  used?: RedisStats['memory']['used'],
  total?: RedisStats['memory']['total']
) => {
  if (used === undefined) {
    return '-';
  }

  if (total === undefined) {
    return formatBytes(used);
  }

  return `${((used / total) * 100).toFixed(2)}%`;
};

export interface RedisStatsModalProps {
  open: boolean;

  onClose(): void;
}

export const RedisStatsModal = ({ open, onClose }: RedisStatsModalProps) => {
  const [stats, setStats] = useState<RedisStats>(null as any);
  const api = useApi();

  useInterval(() => api.getStats().then((stats) => setStats(stats)), 5000);

  if (!stats) {
    return null;
  }

  const items = [
    {
      title: 'Memory usage',
      value: (
        <>
          {stats.memory.total && stats.memory.used ? (
            <small>
              {formatBytes(stats.memory.used)} of {formatBytes(stats.memory.total)}
            </small>
          ) : (
            <small className="error">Could not retrieve memory stats</small>
          )}
          {getMemoryUsage(stats.memory.used, stats.memory.total)}
        </>
      ),
    },
    { title: 'Peak memory usage', value: formatBytes(stats.memory.peak) },
    { title: 'Fragmentation ratio', value: stats.memory.fragmentationRatio },
    { title: 'Connected clients', value: stats.clients.connected },
    { title: 'Blocked clients', value: stats.clients.blocked },
    { title: 'Version', value: stats.version },
    { title: 'Mode', value: stats.mode },
    { title: 'OS', value: stats.os },
    { title: 'Up time', value: stats.uptime },
  ];

  return (
    <Modal width="small" open={open} onClose={onClose} title="Redis details">
      <ul className={s.redisStats}>
        {items.map((item, i) => (
          <li key={i}>
            <span>{item.title}</span>
            <span>{item.value}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
};
