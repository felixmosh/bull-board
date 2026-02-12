import type { AppJob, Status } from '@bull-board/api/typings/app';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TabsType } from '../../../../hooks/useDetailsTabs';
import { useSettingsStore } from '../../../../hooks/useSettings';
import { Highlight } from '../../../Highlight/Highlight';
import { CollapsibleJSON } from '../../../CollapsibleJSON/CollapsibleJSON';
import { ChevronDown } from '../../../Icons/ChevronDown';
import { Button } from '../../../Button/Button';
import { Timeline } from '../../Timeline/Timeline';
import { JobLogs } from './JobLogs/JobLogs';
import s from './DetailsContent.module.css';

interface DetailsContentProps {
  job: AppJob;
  selectedTab: TabsType;
  status: Status;
  actions: {
    getJobLogs: () => Promise<string[]>;
  };
}

export const DetailsContent = ({ selectedTab, job, actions, status }: DetailsContentProps) => {
  const { t } = useTranslation();
  const {
    collapseJobData,
    collapseJobOptions,
    collapseJobError,
    defaultCollapseDepth,
    useCollapsibleJson,
  } = useSettingsStore();
  const [collapseState, setCollapse] = useState({ data: false, options: false, error: false });
  const { stacktrace, data: jobData, returnValue, opts, failedReason } = job;

  switch (selectedTab) {
    case 'Data':
      if (collapseJobData && !collapseState.data) {
        return (
          <Button onClick={() => setCollapse({ ...collapseState, data: true })}>
            {t('JOB.SHOW_DATA_BTN')} <ChevronDown />
          </Button>
        );
      }
      return useCollapsibleJson ? (
        <CollapsibleJSON
          data={{ jobData, returnValue }}
          defaultCollapseDepth={defaultCollapseDepth}
        />
      ) : (
        <Highlight language="json" text={JSON.stringify({ jobData, returnValue }, null, 2)} />
      );
    case 'Options':
      if (collapseJobOptions && !collapseState.options) {
        return (
          <Button onClick={() => setCollapse({ ...collapseState, options: true })}>
            {t('JOB.SHOW_OPTIONS_BTN')} <ChevronDown />
          </Button>
        );
      }
      return useCollapsibleJson ? (
        <CollapsibleJSON data={opts} defaultCollapseDepth={defaultCollapseDepth} />
      ) : (
        <Highlight language="json" text={JSON.stringify(opts, null, 2)} />
      );
    case 'Error':
      if (stacktrace.length === 0) {
        return <div className="error">{!!failedReason ? failedReason : t('JOB.NA')}</div>;
      }

      return collapseJobError && !collapseState.error ? (
        <Button onClick={() => setCollapse({ ...collapseState, error: true })}>
          {t('JOB.SHOW_ERRORS_BTN')} <ChevronDown />
        </Button>
      ) : (
        <Highlight language="stacktrace" key="stacktrace" text={stacktrace.join('\n')} />
      );
    case 'Logs':
      return <JobLogs actions={actions} job={job} />;
    case 'Timeline':
      return <Timeline job={job} status={status} className={s.timeline} />;
    default:
      return null;
  }
};
