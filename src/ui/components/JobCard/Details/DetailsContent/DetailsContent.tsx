import React from 'react';
import { AppJob } from '../../../../../@types/app';
import { TabsType } from '../../../../hooks/useDetailsTabs';
import { Highlight } from '../../../Highlight/Highlight';
import { JobLogs } from './JobLogs/JobLogs';

interface DetailsContentProps {
  job: AppJob;
  selectedTab: TabsType;
  actions: {
    getJobLogs: () => Promise<string[]>;
  };
}

export const DetailsContent = ({
  selectedTab,
  job: { stacktrace, data, returnValue, opts, failedReason },
  actions,
}: DetailsContentProps) => {
  switch (selectedTab) {
    case 'Data':
      return (
        <Highlight language="json">
          {JSON.stringify({ data, returnValue }, null, 2)}
        </Highlight>
      );
    case 'Options':
      return (
        <Highlight language="json">{JSON.stringify(opts, null, 2)}</Highlight>
      );
    case 'Error':
      return (
        <>
          {stacktrace.length === 0 ? (
            <div className="error">{!!failedReason ? failedReason : 'NA'}</div>
          ) : (
            <Highlight language="stacktrace" key="stacktrace">
              {stacktrace.join('\n')}
            </Highlight>
          )}
        </>
      );
    case 'Logs':
      return <JobLogs actions={actions} />;
    default:
      return null;
  }
};
