'use client';

import cn from 'clsx';
import { Maximize2, Minimize2 } from 'lucide-react';
import React, { Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveJobId } from '../../hooks/useActiveJobId';
import { useActiveQueueName } from '../../hooks/useActiveQueueName';
import { useJobFlow } from '../../hooks/useJobFlow';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { Tooltip } from '../Tooltip/Tooltip';
import jobCardStyles from '../JobCard/JobCard.module.css';
import styles from './JobFlow.module.css';

const FlowGraphLazy = React.lazy(() => import('./FlowGraph'));

export const JobFlow = () => {
  const { t } = useTranslation();
  const { flow, loading, error } = useJobFlow();
  const jobId = useActiveJobId();
  const queueName = useActiveQueueName();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullscreen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>{t('JOB.FLOW.LOADING')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <h3 className={styles.errorTitle}>{t('JOB.FLOW.ERROR_TITLE')}</h3>
        <p className={styles.errorMessage}>{error}</p>
      </div>
    );
  }

  if (!flow || !flow.isFlowNode || !flow.flowRoot) {
    return null;
  }

  return (
    <Card className={cn(jobCardStyles.card, styles.jobFlowCard, fullscreen && styles.fullscreen)}>
      <div className={jobCardStyles.header}>
        <div className={jobCardStyles.titleWithLink}>
          <h4>{t('JOB.FLOW.TITLE')}</h4>
        </div>
        <Tooltip title={t(fullscreen ? 'JOB.FLOW.FULLSCREEN_EXIT' : 'JOB.FLOW.FULLSCREEN_ENTER')}>
          <Button
            className={styles.headerButton}
            aria-label={t(fullscreen ? 'JOB.FLOW.FULLSCREEN_EXIT' : 'JOB.FLOW.FULLSCREEN_ENTER')}
            onClick={() => setFullscreen((current) => !current)}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </Button>
        </Tooltip>
      </div>
      <div className={styles.content}>
        <Suspense fallback={<div className={styles.spinner} />}>
          <FlowGraphLazy root={flow.flowRoot} activeJob={jobId ? { id: jobId, queueName } : null} />
        </Suspense>
      </div>
    </Card>
  );
};
