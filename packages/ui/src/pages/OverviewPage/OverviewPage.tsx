import React from 'react';
import { QueueCard } from '../../components/QueueCard/QueueCard';
import { StatusLegend } from '../../components/StatusLegend/StatusLegend';
import { useQueues } from '../../hooks/useQueues';
import s from './OverviewPage.module.css';
import { useSettingsStore } from '../../hooks/useSettings';
import { useTranslation } from 'react-i18next';

export const OverviewPage = () => {
  const { actions, queues } = useQueues();
  const { showOnlyFailedQueues } = useSettingsStore();
  const { t } = useTranslation();
  actions.pollQueues();

  const getFilteredQueues = () => {
    if (showOnlyFailedQueues) {
      return queues?.filter((queue) => queue.counts.failed > 0);
    }
    return queues;
  };

  return (
    <section>
      <StatusLegend />
      <ul className={s.overview}>
        {getFilteredQueues()?.map((queue) => (
          <li key={queue.name}>
            <QueueCard queue={queue} />
          </li>
        ))}
      </ul>
      {showOnlyFailedQueues && getFilteredQueues()?.length === 0 && (
        <>{t('QUEUE.FAILED_QUEUES_NOT_FOUND')}</>
      )}
    </section>
  );
};
