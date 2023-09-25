import { AppJob } from '@bull-board/api/typings/app';
import React, { useState } from 'react';
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
  const { collapseJobData, collapseJobOptions, collapseJobError } = useSettingsStore();
  const [collapseState, setCollapse] = useState({ data: false, options: false, error: false });
  const { stacktrace, data, returnValue, opts, failedReason } = job;

  switch (selectedTab) {
    case 'Data':
      return collapseJobData && !collapseState.data ? (
        <Button onClick={() => setCollapse({ ...collapseState, data: true })}>
          Show data <ArrowDownIcon />
        </Button>
      ) : (
        <Highlight language="json">{JSON.stringify({ data, returnValue }, null, 2)}</Highlight>
      );
    case 'Options':
      return collapseJobOptions && !collapseState.options ? (
        <Button onClick={() => setCollapse({ ...collapseState, options: true })}>
          Show options <ArrowDownIcon />
        </Button>
      ) : (
        <Highlight language="json">{JSON.stringify(opts, null, 2)}</Highlight>
      );
    case 'Error':
      if (stacktrace.length === 0) {
        return <div className="error">{!!failedReason ? failedReason : 'NA'}</div>;
      }

      return collapseJobError && !collapseState.error ? (
        <Button onClick={() => setCollapse({ ...collapseState, error: true })}>
          Show errors <ArrowDownIcon />
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
