import React from 'react';
import { useDetailsTabs } from '../../../hooks/useDetailsTabs';
import { Button } from '../Button/Button';
import s from './Details.module.css';
import { DetailsContent } from './DetailsContent/DetailsContent';
import { AppJob, Status } from '@bull-board/api/typings/app';
import classNames from 'classnames/bind';
import { useSettingsStore } from '../../../hooks/useSettings';

const cx = classNames.bind(s);

interface DetailsProps {
  job: AppJob;
  status: Status;
  actions: { getJobLogs: () => Promise<string[]> };
}

export const Details = ({ status, job, actions }: DetailsProps) => {
  const { darkMode } = useSettingsStore();
  const { tabs, selectedTab } = useDetailsTabs(status, job.isFailed);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className={cx(s.details, {dark: darkMode})}>
      <ul className={cx(s.tabActions, {dark: darkMode})}>
        {tabs.map((tab) => (
          <li key={tab.title}>
            <Button theme={darkMode ? 'basicDark' : 'basic'} onClick={tab.selectTab} isActive={tab.isActive}>
              {tab.title}
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
