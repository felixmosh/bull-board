/* eslint-disable no-console */
import React, { SyntheticEvent, useEffect, useState, useRef } from 'react';
import { AppJob } from '@bull-board/api/typings/app';
import { Button } from '../../../Button/Button';
import { FullscreenIcon } from '../../../../Icons/Fullscreen';
import { PlayIcon } from '../../../../Icons/Play';
import { PauseIcon } from '../../../../Icons/Pause';
import { useInterval } from '../../../../../hooks/useInterval';
import s from './JobLogs.module.css';

interface JobLogsProps {
  job: AppJob;
  actions: {
    getJobLogs: () => Promise<string[]>;
  };
}

interface LogType {
  lineNumber: number;
  message: string;
}

const getLogType = ({ message }: LogType) => {
  const msgType = message?.match(/((info|warn|error)?):/i)?.[1] || '';
  return msgType.toLowerCase();
};

const onClickFullScreen = (el: HTMLElement | null) => async () => {
  if (!!el && document.fullscreenElement !== el) return await el.requestFullscreen();
  return document.exitFullscreen();
};

const shouldShow = (log: LogType, keyword = '') => {
  return !keyword || new RegExp(`${keyword}`, 'i').test(log.message);
};

const formatLogs = (logs: string[]): LogType[] => {
  return logs.map((message, lineNumber) => ({
    message,
    lineNumber: lineNumber + 1,
  }));
};

export const JobLogs = ({ actions, job }: JobLogsProps) => {
  const [logs, setLogs] = useState<LogType[]>([]);
  const [liveLogs, setLiveLogs] = useState(false);
  const [keyword, setKeyword] = useState('');
  const logsContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    actions.getJobLogs().then((logs) => {
      mounted && setLogs(formatLogs(logs));
    });

    return () => {
      mounted = false;
    };
  }, []);

  useInterval(
    async () => {
      const wrapper = logsContainer.current?.querySelector(`.${s.preWrapper}`);
      const logs = await actions.getJobLogs();
      setLogs(formatLogs(logs));
      requestAnimationFrame(() => {
        wrapper?.scrollTo({
          top: wrapper?.scrollHeight,
          behavior: 'smooth',
        });
      });
    },
    liveLogs ? 2500 : null
  );

  const onClickLiveLogsButton = () => {
    setLiveLogs(!liveLogs);
  };

  const onSearch = (event: SyntheticEvent<HTMLInputElement>) => {
    if (!!!event.currentTarget?.value) setKeyword('');
  };

  const onSearchSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    setKeyword(event.currentTarget?.searchQuery?.value || '');
    event.preventDefault();
  };

  return (
    <div className={s.jobLogs} ref={logsContainer}>
      <div className={s.logsToolbar}>
        <form onSubmit={onSearchSubmit}>
          <input
            className={s.searchBar}
            name="searchQuery"
            type="search"
            placeholder="Filter logs"
            onChange={onSearch}
          />
        </form>
        {!job.finishedOn && (
          <Button onClick={onClickLiveLogsButton}>{liveLogs ? <PauseIcon /> : <PlayIcon />}</Button>
        )}
        <Button onClick={onClickFullScreen(logsContainer.current)}>
          <FullscreenIcon />
        </Button>
      </div>
      <div className={s.preWrapper}>
        <pre>
          {logs
            .filter((log) => shouldShow(log, keyword))
            .map((log) => (
              <span
                key={log.lineNumber}
                className={getLogType(log)}
                data-line-number={`${log.lineNumber}. `}
              >
                <i>{log.lineNumber}</i> {log.message}
              </span>
            ))}
        </pre>
      </div>
    </div>
  );
};
