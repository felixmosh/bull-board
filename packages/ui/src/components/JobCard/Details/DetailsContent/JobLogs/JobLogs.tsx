/* eslint-disable no-console */
import React, { SyntheticEvent, useEffect, useState, useRef, useMemo } from 'react';
import { AppJob } from '@bull-board/api/typings/app';
import { Button } from '../../../Button/Button';
import { PlayIcon } from '../../../../Icons/Play';
import { generateSlug } from '../../../../../utils/generateSlug';
import { useInterval } from '../../../../../hooks/useInterval';
import s from './JobLogs.module.css';

interface JobLogsProps {
  job: AppJob;
  actions: {
    getJobLogs: () => Promise<string[]>;
  };
}

interface LogsType {
  lineNumber: number;
  message: string;
  isVisible: boolean;
}

const formatLogs = (logs: string[]): LogsType[] => {
  return logs.map((message, lineNumber) => ({
    message,
    lineNumber,
    isVisible: true,
  }));
};

const getLogType = (message: string) => {
  const msgType = message?.match(/((info|warn|error)?):/i)?.[1] || '';
  return msgType.toLowerCase();
};

const onSearchSubmit = (event?: SyntheticEvent<HTMLFormElement>) => {
  event?.preventDefault();
};

const onClickFullScreen = (newJobId: string) => async () => {
  const el = document.querySelector(`#${newJobId}`) as HTMLElement;
  if (document.fullscreenElement != el) return await el.requestFullscreen();
  return document.exitFullscreen();
};

export const JobLogs = ({ actions, job }: JobLogsProps) => {
  const pollingTimer = useRef<NodeJS.Timer>();
  const [logs, setLogs] = useState<LogsType[]>([]);
  const [liveLogs, setLiveLogs] = useState(false);
  const [keyword, setKeyword] = useState('');
  const currentKeyword = useRef(keyword);
  const newJobId = useMemo(() => generateSlug(`${job.name}-${job.id}-logs`), [job.name, job.id]);
  const preWrapperSelector = useRef<HTMLElement>();

  useEffect(() => {
    let mounted = true;
    actions.getJobLogs().then((logs) => {
      mounted && setLogs(formatLogs(logs));
    });

    // update selectors
    preWrapperSelector.current = document.querySelector(
      `#${newJobId} > div:last-child`
    ) as HTMLElement;

    return () => {
      mounted = false;
      if (!!pollingTimer) clearInterval(pollingTimer.current as unknown as number);
    };
  }, []);

  useEffect(() => {
    setLogs(getFilteredLogs());
  }, [keyword]);

  useInterval(
    async () => {
      const pre = preWrapperSelector.current?.querySelector(`pre`) as HTMLElement;
      const logs = await actions.getJobLogs();
      setLogs(getFilteredLogs(formatLogs(logs)));
      preWrapperSelector.current?.scrollTo({ top: pre.scrollHeight });
    },
    liveLogs ? 2500 : null
  );

  const onClickLiveLogsButton = () => {
    setLiveLogs(!liveLogs);
  };

  const onChangeKeyword = (event: SyntheticEvent<HTMLInputElement>) => {
    setKeyword(event.currentTarget.value);
    currentKeyword.current = event.currentTarget.value;
  };

  const getFilteredLogs = (logsToUse = logs) => {
    if (!!!currentKeyword) return logsToUse;
    return logsToUse.map(({ lineNumber, message }) => ({
      isVisible: new RegExp(`${currentKeyword.current}`, 'i').test(message),
      lineNumber,
      message,
    }));
  };

  return (
    <>
      <div className={s.jobLogs} id={newJobId}>
        <div className={s.logsToolbar}>
          <form onSubmit={onSearchSubmit}>
            <input
              className={s.searchBar}
              type="search"
              placeholder="Filters"
              value={keyword}
              onChange={onChangeKeyword}
            />
          </form>
          {!job.finishedOn && (
            <Button
              className={liveLogs ? s.isActive : ''}
              theme="primary"
              isActive={liveLogs}
              onClick={onClickLiveLogsButton}
            >
              <PlayIcon />
              Live
            </Button>
          )}
          <Button theme="primary" onClick={onClickFullScreen(newJobId)}>
            Fullscreen
          </Button>
        </div>
        <div className={s.preWrapper}>
          <pre>
            {logs.map(
              (log) =>
                log.isVisible && (
                  <span key={log.lineNumber} className={getLogType(log.message)}>
                    <>{`${log.lineNumber} ${log.message}\n`}</>
                  </span>
                )
            )}
          </pre>
        </div>
      </div>
    </>
  );
};
