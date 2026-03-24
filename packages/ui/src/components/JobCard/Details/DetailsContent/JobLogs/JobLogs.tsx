import type { AppJob } from '@bull-board/api/typings/app';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInterval } from '../../../../../hooks/useInterval';
import { FullscreenIcon } from '../../../../Icons/Fullscreen';
import { PauseIcon } from '../../../../Icons/Pause';
import { PlayIcon } from '../../../../Icons/Play';
import { CopyButton } from '../../../../CopyButton/CopyButton';
import { Button } from '../../../../Button/Button';
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
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogType[]>([]);
  const [liveLogs, setLiveLogs] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [inputValue, setInputValue] = useState('');
  const logsContainer = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let mounted = true;
    actions.getJobLogs().then((logs) => {
      if (mounted) {
        setLogs(formatLogs(logs));
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useInterval(
    async () => {
      const logs = await actions.getJobLogs();
      setLogs(formatLogs(logs));
      requestAnimationFrame(() => {
        logsContainer.current?.scrollTo({
          top: logsContainer.current?.scrollHeight,
          behavior: 'smooth',
        });
      });
    },
    liveLogs ? 2500 : null
  );

  const toggleLiveLogsButton = () => {
    setLiveLogs(!liveLogs);
  };

  const onFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setKeyword(value), 250);
  };

  const logsToShow = logs.filter((log) => shouldShow(log, keyword));

  return (
    <div className={s.jobLogs} ref={logsContainer}>
      {logs.length > 0 ? (
        <>
          <ul className={s.toolbar}>
            <li>
              <input
                className={s.searchBar}
                type="text"
                placeholder={t('JOB.LOGS.FILTER_PLACEHOLDER')}
                value={inputValue}
                onChange={onFilterChange}
              />
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
            <li>
              <CopyButton textToCopy={logsToShow.map((log) => log.message).join('\n')} />
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
                    <CopyButton
                      textToCopy={log.message}
                      className={s.logLineCopyButton}
                      tabIndex={-1}
                    />
                  </li>
                ))}
              </ol>
            </pre>
          </div>
        </>
      ) : (
        <div className={s.emptyState}>
          {t('JOB.NO_LOGS')}
          {!job.finishedOn && (
            <Button isActive={liveLogs} onClick={toggleLiveLogsButton}>
              {liveLogs ? <PauseIcon /> : <PlayIcon />}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
