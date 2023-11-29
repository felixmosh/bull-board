import { AppJob } from '@bull-board/api/typings/app';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TabsType } from '../../../../hooks/useDetailsTabs';
import { useSettingsStore } from '../../../../hooks/useSettings';
import { Highlight } from '../../../Highlight/Highlight';
import { ArrowDownIcon } from '../../../Icons/ArrowDownIcon';
import { Button } from '../../../Button/Button';
import { JobLogs } from './JobLogs/JobLogs';

interface DetailsContentProps {
  job: AppJob;
  selectedTab: TabsType;
  actions: {
    getJobLogs: () => Promise<string[]>;
  };
}

export const DetailsContent = ({ selectedTab, job, actions }: DetailsContentProps) => {
  const { t } = useTranslation();
  const { collapseJobData, collapseJobOptions, collapseJobError } = useSettingsStore();
  const [collapseState, setCollapse] = useState({ data: false, options: false, error: false });
  const { stacktrace, data, returnValue, opts, failedReason } = job;

  switch (selectedTab) {
    case 'Data':
      return collapseJobData && !collapseState.data ? (
        <Button onClick={() => setCollapse({ ...collapseState, data: true })}>
          {t('JOB.SHOW_DATA_BTN')} <ArrowDownIcon />
        </Button>
      ) : (
        <Highlight language="json">{JSON.stringify({ data, returnValue }, null, 2)}</Highlight>
      );
    case 'Options':
      return collapseJobOptions && !collapseState.options ? (
        <Button onClick={() => setCollapse({ ...collapseState, options: true })}>
          {t('JOB.SHOW_OPTIONS_BTN')} <ArrowDownIcon />
        </Button>
      ) : (
        <Highlight language="json">{JSON.stringify(opts, null, 2)}</Highlight>
      );
    case 'Error':
      if (stacktrace.length === 0) {
        return <div className="error">{!!failedReason ? failedReason : t('JOB.NA')}</div>;
      }

      return collapseJobError && !collapseState.error ? (
        <Button onClick={() => setCollapse({ ...collapseState, error: true })}>
          {t('JOB.SHOW_ERRORS_BTN')} <ArrowDownIcon />
        </Button>
      ) : (
        <Highlight language="stacktrace" key="stacktrace">
          {stacktrace.join('\n')}
        </Highlight>
      );
    case 'Logs':
      return <JobLogs actions={actions} job={job} />;
    default:
      return null;
  }
};
