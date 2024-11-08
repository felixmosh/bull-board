import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDetailsTabs } from '../../../hooks/useDetailsTabs';
import { Button } from '../../Button/Button';
import s from './Details.module.css';
import { DetailsContent } from './DetailsContent/DetailsContent';
import { AppJob, Status } from '@bull-board/api/typings/app';

interface DetailsProps {
  job: AppJob;
  status: Status;
  actions: { getJobLogs: () => Promise<string[]> };
}

export const Details = ({ status, job, actions }: DetailsProps) => {
  const { tabs, selectedTab } = useDetailsTabs(status);
  const { t } = useTranslation();

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className={s.details}>
      <ul className={s.tabActions}>
        {tabs.map((tab) => (
          <li key={tab.title}>
            <Button onClick={tab.selectTab} isActive={tab.isActive}>
              {t(`JOB.TABS.${tab.title.toUpperCase()}`)}
            </Button>
          </li>
        ))}
      </ul>
      <div className={s.tabContent}>
        <DetailsContent selectedTab={selectedTab} job={job} actions={actions} />
      </div>
    </div>
  );
};
