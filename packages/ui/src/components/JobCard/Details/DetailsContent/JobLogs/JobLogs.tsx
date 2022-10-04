/* eslint-disable no-console */
import React, { SyntheticEvent, useEffect, useState, useRef } from 'react';
import { AppJob } from '@bull-board/api/typings/app';
import { Button } from '../../../Button/Button';
import { PlayIcon } from '../../../../Icons/Play';
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
}

const attachLineNumbers = (logs: string[]): LogsType[] => {
  return logs.map((message, lineNumber) => ({
    message,
    lineNumber,
  }));
};

export const JobLogs = ({ actions, job }: JobLogsProps) => {
  const pollingTimer = useRef<NodeJS.Timer>();
  const [originalLogs, setOriginalLogs] = useState<LogsType[]>([]);
  const [logs, setLogs] = useState<LogsType[]>([]);
  const [liveLogs, setLiveLogs] = useState(false);
  const [keyword, setKeyword] = useState('');
  const currentKeyword = useRef(keyword);
  const newJobId = `${job.name}-${job.id}-logs`;

  useEffect(() => {
    let mounted = true;
    actions.getJobLogs().then((logs) => {
      mounted && setOriginalLogs(attachLineNumbers(logs));
      mounted && setLogs(attachLineNumbers(logs));
    });

    return () => {
      mounted = false;
      if (!!pollingTimer) clearInterval(pollingTimer.current as unknown as number);
    };
  }, []);

  useEffect(() => {
    setLogs(getFilteredLogs());
  }, [keyword]);

  const getLogType = (message: string) => {
    const msgType = message.match(/((info|warn|error)?):/i)?.[1] || '';
    return msgType.toLowerCase();
  };

  const onClickFullScreen = async () => {
    const el = document.querySelector(`#${newJobId}`) as HTMLElement;
    if (document.fullscreenElement != el) return await el.requestFullscreen();
    return document.exitFullscreen();
  };

  const onClickLiveLogsButton = () => {
    const el = document.querySelector(`#${newJobId} > div:last-child`) as HTMLElement;
    const pre = el.querySelector(`pre`) as HTMLElement;

    setLiveLogs(!liveLogs);
    if (liveLogs && !!pollingTimer) {
      clearInterval(pollingTimer.current as unknown as number);
    } else {
      pollingTimer.current = setInterval(async () => {
        const logs = await actions.getJobLogs();
        setOriginalLogs(attachLineNumbers(logs));
        setLogs(getFilteredLogs(attachLineNumbers(logs)));
        el.scrollTo({ top: pre.scrollHeight });
      }, 1000);
    }
  };

  const onChangeKeyword = (event: SyntheticEvent<HTMLInputElement>) => {
    setKeyword(event.currentTarget.value);
    currentKeyword.current = event.currentTarget.value;
  };

  const onSearchSubmit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
  };

  const getFilteredLogs = (logs = originalLogs) => {
    if (!!!currentKeyword) return logs;
    return logs.filter(({ message }) => new RegExp(`${currentKeyword.current}`, 'i').test(message));
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
          <Button theme="primary" onClick={onClickFullScreen}>
            Fullscreen
          </Button>
        </div>
        <div className={s.preWrapper}>
          <pre>
            {logs.map((log) => (
              <span key={log.lineNumber} className={getLogType(log.message)}>
                <>{`${log.lineNumber} ${log.message}\n`}</>
              </span>
            ))}
          </pre>
        </div>
      </div>
    </>
  );
};
