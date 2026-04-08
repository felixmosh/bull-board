import type { AppJob, AppQueue } from '@bull-board/api/typings/app';
import React, { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useModal } from '../../hooks/useModal';
import { useQueues } from '../../hooks/useQueues';
import { links } from '../../utils/links';
import { Card } from '../Card/Card';
import { QueueDropdownActions } from '../QueueDropdownActions/QueueDropdownActions';
import { QueueStats } from './QueueStats/QueueStats';
import s from './QueueCard.module.css';

interface IQueueCardProps {
  queue: AppQueue;
}

const AddJobModalLazy = React.lazy(() =>
  import('../AddJobModal/AddJobModal').then(({ AddJobModal }) => ({
    default: AddJobModal,
  }))
);

const ConcurrencyModalLazy = React.lazy(() =>
  import('../ConcurrencyModal/ConcurrencyModal').then(({ ConcurrencyModal }) => ({
    default: ConcurrencyModal,
  }))
);

export const QueueCard = ({ queue }: IQueueCardProps) => {
  const { t } = useTranslation();
  const { actions } = useQueues();
  const modal = useModal<'addJob' | 'concurrency'>();
  const [editJob] = React.useState<AppJob | null>(null);

  return (
    <Card className={s.queueCard}>
      <div className={s.header}>
        <NavLink to={links.queuePage(queue.name)} className={s.link}>
          {queue.displayName}
        </NavLink>
        <div className={s.headerContext}>
          {queue.isPaused && <span className={s.pausedBadge}>[ {t('MENU.PAUSED')} ]</span>}
          {!queue.readOnlyMode && (
            <QueueDropdownActions
              queue={queue}
              actions={{
                ...actions,
                addJob: () => modal.open('addJob'),
                onConcurrency: () => modal.open('concurrency'),
              }}
            />
          )}
        </div>
      </div>
      <QueueStats queue={queue} />
      <Suspense fallback={null}>
        {modal.isMounted('addJob') && (
          <AddJobModalLazy
            open={modal.isOpen('addJob')}
            onClose={modal.close('addJob')}
            job={editJob}
            queue={queue}
          />
        )}
        {modal.isMounted('concurrency') && (
          <ConcurrencyModalLazy
            open={modal.isOpen('concurrency')}
            onClose={modal.close('concurrency')}
            queue={queue}
          />
        )}
      </Suspense>
    </Card>
  );
};
