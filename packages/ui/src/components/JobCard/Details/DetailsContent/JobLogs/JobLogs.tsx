import { AppJob } from '@bull-board/api/typings/app';
import React, { SyntheticEvent, useEffect, useRef, useState } from 'react';
import { useInterval } from '../../../../../hooks/useInterval';
import { InputField } from '../../../../Form/InputField/InputField';
import { FullscreenIcon } from '../../../../Icons/Fullscreen';
import { PauseIcon } from '../../../../Icons/Pause';
import { PlayIcon } from '../../../../Icons/Play';
import { Button } from '../../../Button/Button';
import s from './JobLogs.module.css';

interface JobLogsProps {
  job: AppJob;
  actions: {
    getJobLogs: () => Promise<string[]>;
  };
}

interface LogType {
  message: string;
  lineNumber: number;
}

const getLogType = (log: LogType) => {
  const msgType = log.message?.match(/((info|warn|error)?):/i)?.[1];
  return msgType?.toLowerCase();
};

const onClickFullScreen = (el: HTMLElement | null) => async () => {
  if (!!el && document.fullscreenElement !== el) return await el.requestFullscreen();
  return document.exitFullscreen();
};

const shouldShow = (log: LogType, keyword = '') => {
  return !keyword || new RegExp(`${keyword}`, 'i').test(log.message);
};

function formatLogs(logs: string[]) {
  return logs.map((message, i) => ({ message, lineNumber: i + 1 }));
}

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

  const toggleLiveLogsButton = () => {
    setLiveLogs(!liveLogs);
  };

  const onSearch = (event: SyntheticEvent<HTMLInputElement>) => {
    if (!event.currentTarget?.value) {
      setKeyword('');
    }
  };

  const onSearchSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    setKeyword(event.currentTarget?.searchQuery?.value || '');
    event.preventDefault();
  };

  const logsToShow = logs.filter((log) => shouldShow(log, keyword));

  return (
    <div className={s.jobLogs} ref={logsContainer}>
      <ul className={s.toolbar}>
        <li>
          <form onSubmit={onSearchSubmit}>
            <InputField
              className={s.searchBar}
              name="searchQuery"
              type="search"
              placeholder="Filters"
              onChange={onSearch}
            />
          </form>
        </li>

        {!job.finishedOn && (
          <li>
            <Button isActive={liveLogs} onClick={toggleLiveLogsButton}>
              {liveLogs ? <PauseIcon /> : <PlayIcon />}
            </Button>
          </li>
        )}
        <li>
          <Button onClick={onClickFullScreen(logsContainer.current)}>
            <FullscreenIcon />
          </Button>
        </li>
      </ul>
      <div className={s.preWrapper}>
        <pre>
          <ol style={{ paddingInlineStart: `${`${logsToShow.length}`.length + 1}ch` }}>
            {logsToShow.map((log) => (
              <li
                key={log.lineNumber}
                className={getLogType(log)}
                data-line-number={`${log.lineNumber}.`}
              >
                {log.message}
              </li>
            ))}
          </ol>
        </pre>
      </div>
    </div>
  );
};
