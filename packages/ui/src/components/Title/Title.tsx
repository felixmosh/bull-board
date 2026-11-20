import React, { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useMobileQuery } from '../../hooks/useMobileQuery';
import { Button } from '../Button/Button';
import { InfoIcon } from '../Icons/Info';
import s from './Title.module.css';

const PAGE_TITLE_KEYS = {
  '/': 'MENU.OVERVIEW',
  '/metrics-history': 'MENU.METRICS_HISTORY',
  '/job-schedulers': 'MENU.SCHEDULERS',
} as const;

const QueueInfoModalLazy = React.lazy(() =>
  import('../QueueInfoModal/QueueInfoModal').then(({ QueueInfoModal }) => ({
    default: QueueInfoModal,
  }))
);

export const Title = () => {
  const { t } = useTranslation();
  const queue = useActiveQueue();
  const isMobile = useMobileQuery();
  const [infoOpen, setInfoOpen] = useState(false);
  const { pathname } = useLocation();

  const pageTitleKey = queue
    ? undefined
    : PAGE_TITLE_KEYS[pathname as keyof typeof PAGE_TITLE_KEYS];

  if (pageTitleKey) {
    return isMobile ? (
      <h1 className="sr-only">{t(pageTitleKey)}</h1>
    ) : (
      <div className={s.queueTitle}>
        <h1 className={s.name}>{t(pageTitleKey)}</h1>
      </div>
    );
  }

  if (!queue || isMobile) return <div />;

  return (
    <div className={s.queueTitle}>
      {queue.displayName && (
        <>
          <div className={s.titleRow}>
            <h1 className={s.name} title={queue.displayName}>
              {queue.displayName}
            </h1>
            <Button
              className={s.infoButton}
              onClick={() => setInfoOpen(true)}
              title={t('QUEUE.INFO.TITLE')}
              aria-label={t('QUEUE.INFO.TITLE')}
            >
              <InfoIcon className={s.infoIcon} />
            </Button>
          </div>
          {queue.description && <p className={s.description}>{queue.description}</p>}
        </>
      )}
      <Suspense fallback={null}>
        {infoOpen && (
          <QueueInfoModalLazy open={infoOpen} queue={queue} onClose={() => setInfoOpen(false)} />
        )}
      </Suspense>
    </div>
  );
};
