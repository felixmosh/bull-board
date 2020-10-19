import { format, formatDistance, getYear, isToday } from 'date-fns'
import React from 'react'
import { AppJob } from '../../../../@types/app'
import { Status } from '../../constants'
import s from './Timeline.module.css'

type TimeStamp = number | Date

const formatDate = (ts: TimeStamp) => {
  if (isToday(ts)) {
    return format(ts, 'HH:mm:ss')
  }

  return getYear(ts) === getYear(new Date())
    ? format(ts, 'MM/dd HH:mm:ss')
    : format(ts, 'MM/dd/yyyy HH:mm:ss')
}

export const Timeline = function Timeline({
  job,
  status,
}: {
  job: AppJob
  status: Status
}) {
  return (
    <div className={s.timelineWrapper}>
      <ul className={s.timeline}>
        <li>
          <small>Added at</small>
          <time>{formatDate(job.timestamp as number)}</time>
        </li>
        {!!job.delay && job.delay > 0 && status === 'delayed' && (
          <li>
            <small>Delayed for</small>
            <time>
              {formatDistance(
                job.timestamp as number,
                (job.timestamp as number) + job.delay,
                { includeSeconds: true },
              )}
            </time>
          </li>
        )}
        {!!job.processedOn && (
          <li>
            <small>
              {job.delay && job.delay > 0 ? 'delayed for ' : ''}
              {formatDistance(job.processedOn, job.timestamp as number, {
                includeSeconds: true,
              })}
            </small>
            <small>Process started at</small>
            <time>{formatDate(job.processedOn)}</time>
          </li>
        )}
        {!!job.finishedOn && (
          <li>
            <small>
              {formatDistance(job.finishedOn, job.processedOn as number, {
                includeSeconds: true,
              })}
            </small>
            <small>{status === 'failed' ? 'Failed' : 'Finished'} at</small>
            <time>{formatDate(job.finishedOn)}</time>
          </li>
        )}
      </ul>
    </div>
  )
}
