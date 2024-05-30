import { RedisStats } from '@bull-board/api/typings/app';
import { formatDistance } from 'date-fns';
import formatBytes from 'pretty-bytes';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../hooks/useApi';
import { useInterval } from '../../hooks/useInterval';
import { dateFnsLocale } from '../../services/i18n';
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
  const { t } = useTranslation();
  const [stats, setStats] = useState<RedisStats>(null as any);
  const api = useApi();

  useInterval(() => api.getStats().then((stats) => setStats(stats)), 5000);

  if (!stats) {
    return null;
  }

  const items = [
    {
      title: t('REDIS.MEMORY_USAGE'),
      value: (
        <>
          {stats.memory.total && stats.memory.used ? (
            <small>
              {formatBytes(stats.memory.used)} of {formatBytes(stats.memory.total)}
            </small>
          ) : (
            <small className="error">{t('REDIS.ERROR.MEMORY_USAGE')}</small>
          )}
          {getMemoryUsage(stats.memory.used, stats.memory.total)}
        </>
      ),
    },
    { title: t('REDIS.PEEK_MEMORY'), value: formatBytes(stats.memory.peak) },
    { title: t('REDIS.FRAGMENTATION_RATIO'), value: stats.memory.fragmentationRatio },
    { title: t('REDIS.CONNECTED_CLIENTS'), value: stats.clients.connected },
    { title: t('REDIS.BLOCKED_CLIENTS'), value: stats.clients.blocked },
    { title: t('REDIS.VERSION'), value: stats.version },
    { title: t('REDIS.MODE'), value: stats.mode },
    { title: t('REDIS.OS'), value: stats.os },
    {
      title: t('REDIS.UP_TIME'),
      value: formatDistance(0, stats.uptime * 1000, {
        includeSeconds: true,
        locale: dateFnsLocale,
      }),
    },
  ];

  return (
    <Modal width="small" open={open} onClose={onClose} title={t('REDIS.TITLE')}>
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
