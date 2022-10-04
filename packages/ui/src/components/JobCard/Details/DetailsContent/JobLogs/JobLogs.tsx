/* eslint-disable no-console */
import React, { SyntheticEvent, useEffect, useState } from 'react';
import { Button } from '../../../Button/Button';
import { PlayIcon } from '../../../../Icons/Play';
import s from './JobLogs.module.css';

interface JobLogsProps {
  jobId: string;
  actions: {
    getJobLogs: () => Promise<string[]>;
  };
}

let pollingTimer: ReturnType<typeof setInterval>;
export const JobLogs = ({ jobId, actions }: JobLogsProps) => {
  const [originalLogs, setOriginalLogs] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [liveLogs, setLiveLogs] = useState(false);
  const [keyword, setKeyword] = useState('');
  const newJobId = `${jobId}-logs`;

  useEffect(() => {
    let mounted = true;
    actions.getJobLogs().then((logs) => {
      mounted && setOriginalLogs(logs);
      mounted && setLogs(logs);
    });

    return () => {
      mounted = false;
      if (!!pollingTimer) clearInterval(pollingTimer);
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
    setLiveLogs(!liveLogs);
    if (liveLogs && !!pollingTimer) {
      clearInterval(pollingTimer);
    } else {
      pollingTimer = setInterval(async () => {
        const logs = await actions.getJobLogs();
        setLogs(logs);
      }, 1500);
    }
  };

  const onChangeKeyword = (event: SyntheticEvent<HTMLInputElement>) => {
    setKeyword(event.currentTarget.value);
  };

  const onSearchSubmit = (event?: SyntheticEvent<HTMLFormElement>) => {
    event?.preventDefault();
  };

  const getFilteredLogs = () => {
    if (!!!keyword) return originalLogs;
    return originalLogs.filter((logText) => new RegExp(`${keyword}`, 'i').test(logText));
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
          <Button
            className={liveLogs ? s.isActive : ''}
            theme="primary"
            isActive={liveLogs}
            onClick={onClickLiveLogsButton}
          >
            <PlayIcon />
            Live
          </Button>
          <Button theme="primary" onClick={onClickFullScreen}>
            Fullscreen
          </Button>
        </div>
        <div className={s.preWrapper}>
          <pre>
            {logs.map((log, idx) => (
              <span key={idx} className={getLogType(log)}>
                <>{`${idx} ${log}\n`}</>
              </span>
            ))}
          </pre>
        </div>
      </div>
    </>
  );
};
