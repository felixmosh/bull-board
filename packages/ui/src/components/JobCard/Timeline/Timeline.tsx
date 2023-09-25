import { format, formatDistance, getYear, isToday, differenceInMilliseconds } from 'date-fns';
import React from 'react';
import s from './Timeline.module.css';
import { AppJob, Status } from '@bull-board/api/typings/app';
import { STATUSES } from '@bull-board/api/src/constants/statuses';

type TimeStamp = number | Date;

const formatDate = (ts: TimeStamp) => {
  if (isToday(ts)) {
    return format(ts, 'HH:mm:ss');
  }

  return getYear(ts) === getYear(new Date())
    ? format(ts, 'MM/dd HH:mm:ss')
    : format(ts, 'MM/dd/yyyy HH:mm:ss');
};
const formatDuration = (finishedTs: TimeStamp, processedTs: TimeStamp) => {
  const durationInMs = differenceInMilliseconds(finishedTs, processedTs);
  const durationInSeconds = durationInMs / 1000;
  if (durationInSeconds > 5) {
    return formatDistance(finishedTs, processedTs, {
      includeSeconds: true,
    });
  }
  if (durationInSeconds >= 1) {
    return `${durationInSeconds.toFixed(2)} seconds`;
  }
    return `${durationInMs} milliseconds`;
}

export const Timeline = function Timeline({ job, status }: { job: AppJob; status: Status }) {
  return (
    <div className={s.timelineWrapper}>
      <ul className={s.timeline}>
        <li>
          <small>Added at</small>
          <time>{formatDate(job.timestamp || 0)}</time>
        </li>
        {!!job.delay && job.delay > 0 && status === STATUSES.delayed && (
          <li>
            <small>Will run at</small>
            <time>{formatDate((job.timestamp || 0) + job.delay)}</time>
          </li>
        )}
        {!!job.processedOn && (
          <li>
            <small>
              {job.delay && job.delay > 0 ? 'delayed for ' : ''}
              {formatDuration(job.processedOn, job.timestamp || 0)}
            </small>
            <small>Process started at</small>
            <time>{formatDate(job.processedOn)}</time>
          </li>
        )}
        {!!job.finishedOn && (
          <li>
            <small>
              {formatDuration(job.finishedOn, job.processedOn || 0)}
            </small>
            <small>{job.isFailed && status !== STATUSES.active ? 'Failed' : 'Finished'} at</small>
            <time>{formatDate(job.finishedOn)}</time>
          </li>
        )}
      </ul>
    </div>
  );
};
