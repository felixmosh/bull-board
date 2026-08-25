import type { AppQueue } from '@bull-board/api/typings/app';
import { useTranslation } from 'react-i18next';
import { useQueues } from '../../hooks/useQueues';
import { RateLimitIcon } from '../Icons/RateLimit';
import { Tooltip } from '../Tooltip/Tooltip';
import s from './RateLimitBadge.module.css';

export const RateLimitBadge = ({ queue }: { queue: AppQueue }) => {
  const { t } = useTranslation();
  const { actions } = useQueues();

  if (!queue.activeRateLimitTtl) {
    return null;
  }

  const seconds = Math.ceil(queue.activeRateLimitTtl / 1000);
  const description = t('RATE_LIMIT.BADGE_TOOLTIP', { seconds });

  return (
    <Tooltip title={description} className={s.badgeWrap}>
      <button
        type="button"
        aria-label={description}
        className={s.badge}
        disabled={queue.readOnlyMode}
        onClick={actions.releaseQueueRateLimit(queue.name)}
      >
        <RateLimitIcon />
        {t('RATE_LIMIT.BADGE', { seconds })}
      </button>
    </Tooltip>
  );
};
