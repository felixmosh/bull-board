import type { RedisStats } from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import formatBytes from 'pretty-bytes';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../../hooks/queryKeys';
import { useApi } from '../../hooks/useApi';
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
  const { t, i18n } = useTranslation();
  const api = useApi();

  const { data: stats } = useQuery({
    queryKey: queryKeys.redisStats,
    queryFn: () => api.getStats(),
    enabled: open,
    refetchInterval: 5000,
  });

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
      value: (() => {
        const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
        const seconds = stats.uptime;
        if (seconds < 60) return rtf.format(-Math.round(seconds), 'second').replace(/ ago$/, '');
        const minutes = seconds / 60;
        if (minutes < 60) return rtf.format(-Math.round(minutes), 'minute').replace(/ ago$/, '');
        const hours = minutes / 60;
        if (hours < 24) return rtf.format(-Math.round(hours), 'hour').replace(/ ago$/, '');
        return rtf.format(-Math.round(hours / 24), 'day').replace(/ ago$/, '');
      })(),
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
