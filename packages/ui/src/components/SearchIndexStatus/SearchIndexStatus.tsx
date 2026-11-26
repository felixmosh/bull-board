import type { GetSearchStatusResponse } from '@bull-board/api/typings/responses';
import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import { useSearchIndexStatus } from '../../hooks/useJobSearch';
import { useModal } from '../../hooks/useModal';
import { SearchIndexModal } from '../SearchIndexModal/SearchIndexModal';
import s from './SearchIndexStatus.module.css';

interface SearchIndexStatusProps {
  queueName: string;
  fields: string[];
  totalJobs: number;
  canCheckCoverage: boolean;
}

const HEALTH_KEYS = {
  ok: 'QUEUE.SEARCH.INDEX.OK',
  degraded: 'QUEUE.SEARCH.INDEX.DEGRADED',
  down: 'QUEUE.SEARCH.INDEX.DOWN',
} as const satisfies Record<GetSearchStatusResponse['health'], string>;

export const SearchIndexStatus = ({
  queueName,
  fields,
  totalJobs,
  canCheckCoverage,
}: SearchIndexStatusProps) => {
  const { t } = useTranslation();
  const modal = useModal<'index'>();
  const status = useSearchIndexStatus(queueName, true);

  const label = status ? t(HEALTH_KEYS[status.health]) : '';
  const reasons = status?.reasons.map((reason) => t(`QUEUE.SEARCH.INDEX.REASON.${reason}`)) ?? [];

  return (
    <div className={s.slot} data-testid="search-index-slot">
      {status && (
        <button
          type="button"
          className={s.pill}
          aria-label={[`${t('QUEUE.SEARCH.INDEX.TITLE')}: ${label}`, ...reasons].join('. ')}
          onClick={() => modal.open('index')}
        >
          <span className={cn(s.dot, s[status.health])} aria-hidden="true" />
          {label}
        </button>
      )}
      {status && modal.isMounted('index') && (
        <SearchIndexModal
          open={modal.isOpen('index')}
          onClose={modal.close('index')}
          queueName={queueName}
          fields={fields}
          totalJobs={totalJobs}
          status={status}
          canCheckCoverage={canCheckCoverage}
        />
      )}
    </div>
  );
};
