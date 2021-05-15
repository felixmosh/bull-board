import React, { useEffect, useState } from 'react';
import s from './JobLogs.module.css';

interface JobLogsProps {
  actions: {
    getJobLogs: () => Promise<string[]>;
  };
}

export const JobLogs = ({ actions }: JobLogsProps) => {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    actions.getJobLogs().then((logs) => mounted && setLogs(logs));
    return () => {
      mounted = false;
    };
  }, []);

  if (!Array.isArray(logs) || !logs.length) {
    return null;
  }

  return (
    <ul className={s.jobLogs}>
      {logs.map((log, idx) => (
        <li key={idx}>{log}</li>
      ))}
    </ul>
  );
};
