import { DATASTORES } from '@bull-board/api/constants/datastores';
import { useQuery } from '@tanstack/react-query';
import formatBytes from 'pretty-bytes';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../../hooks/queryKeys';
import { useApi } from '../../hooks/useApi';
import { Modal } from '../Modal/Modal';
import s from './RedisStatsModal.module.css';

const getMemoryUsage = (used?: number, total?: number) => {
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

  const uptime = (() => {
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
    const seconds = stats.uptime;
    if (seconds < 60) return rtf.format(-Math.round(seconds), 'second').replace(/ ago$/, '');
    const minutes = seconds / 60;
    if (minutes < 60) return rtf.format(-Math.round(minutes), 'minute').replace(/ ago$/, '');
    const hours = minutes / 60;
    if (hours < 24) return rtf.format(-Math.round(hours), 'hour').replace(/ ago$/, '');
    return rtf.format(-Math.round(hours / 24), 'day').replace(/ ago$/, '');
  })();

  const memory = stats.memory;

  // PostgreSQL has no answer for memory usage or replication mode, so those rows are dropped
  // rather than filled with a number that means something else.
  const items = [
    ...(memory
      ? [
          {
            title: t('REDIS.MEMORY_USAGE'),
            value: (
              <>
                {memory.total && memory.used ? (
                  <small>
                    {formatBytes(memory.used)} of {formatBytes(memory.total)}
                  </small>
                ) : (
                  <small className="error">{t('REDIS.ERROR.MEMORY_USAGE')}</small>
                )}
                {getMemoryUsage(memory.used, memory.total)}
              </>
            ),
          },
          { title: t('REDIS.PEEK_MEMORY'), value: formatBytes(memory.peak) },
          { title: t('REDIS.FRAGMENTATION_RATIO'), value: memory.fragmentationRatio },
        ]
      : []),
    { title: t('REDIS.CONNECTED_CLIENTS'), value: stats.clients.connected },
    { title: t('REDIS.BLOCKED_CLIENTS'), value: stats.clients.blocked },
    { title: t('REDIS.VERSION'), value: stats.version },
    ...(stats.mode ? [{ title: t('REDIS.MODE'), value: stats.mode }] : []),
    ...(stats.os ? [{ title: t('REDIS.OS'), value: stats.os }] : []),
    ...(stats.backend === DATASTORES.postgres
      ? [{ title: t('REDIS.PORT'), value: stats.port }]
      : []),
    { title: t('REDIS.UP_TIME'), value: uptime },
  ];

  return (
    <Modal
      width="small"
      open={open}
      onClose={onClose}
      title={stats.backend === DATASTORES.postgres ? t('REDIS.TITLE_POSTGRES') : t('REDIS.TITLE')}
    >
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
