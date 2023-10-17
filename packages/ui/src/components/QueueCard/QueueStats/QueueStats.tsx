import { AppQueue } from '@bull-board/api/typings/app';
import React from 'react';
import { queueStatsStatusList } from '../../../constants/queue-stats-status';
import s from './QueueStats.module.css';

interface IQueueStatsProps {
  queue: AppQueue;
}

export const QueueStats = ({ queue }: IQueueStatsProps) => {
  const total = queueStatsStatusList.reduce((result, status) => result + queue.counts[status], 0);

  return (
    <div className={s.stats}>
      <div className={s.progressBar}>
        {queueStatsStatusList
          .filter((status) => queue.counts[status] > 0)
          .map((status) => {
            const value = queue.counts[status];

            return (
              <div
                key={status}
                role="progressbar"
                style={{ width: `${(value / total) * 100}%` }}
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={total}
                className={s[status]}
              >
                {value}
              </div>
            );
          })}
      </div>
      <div>{total} Jobs</div>
    </div>
  );
};
