import { formatDistance, isToday, differenceInMilliseconds, format, isSameYear } from 'date-fns';
import { TFunction } from 'i18next';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { dateFnsLocale } from '../../../services/i18n';
import s from './Timeline.module.css';
import { AppJob, DateFormats, Status } from '@bull-board/api/typings/app';
import { STATUSES } from '@bull-board/api/src/constants/statuses';
import { useUIConfig } from '../../../hooks/useUIConfig';

type TimeStamp = number | Date;

const formatDate = (ts: TimeStamp, locale: string, customDateFormats: DateFormats) => {
  let options: Intl.DateTimeFormatOptions;

  if (isToday(ts)) {
    if (customDateFormats?.short) {
      return format(new Date(ts), customDateFormats.short);
    }
    options = {
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    };
  } else if (isSameYear(ts, new Date())) {
    if (customDateFormats?.common) {
      return format(new Date(ts), customDateFormats.common);
    }
    options = {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    };
  } else {
    if (customDateFormats?.full) {
      return format(new Date(ts), customDateFormats.full);
    }
    options = {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    };
  }

  return new Intl.DateTimeFormat(locale, options).format(ts);
};

const formatDuration = (finishedTs: TimeStamp, processedTs: TimeStamp, t: TFunction) => {
  const durationInMs = differenceInMilliseconds(finishedTs, processedTs);
  const durationInSeconds = durationInMs / 1000;
  if (durationInSeconds > 5) {
    return formatDistance(finishedTs, processedTs, {
      includeSeconds: true,
      locale: dateFnsLocale,
    });
  }
  if (durationInSeconds >= 1) {
    return t('JOB.DURATION.SECS', { duration: durationInSeconds.toFixed(2) });
  }
  return t('JOB.DURATION.MILLI_SECS', { duration: durationInMs });
};

export const Timeline = function Timeline({ job, status }: { job: AppJob; status: Status }) {
  const { t, i18n } = useTranslation();
  const uiConfig = useUIConfig();
  const dateFormats = uiConfig.dateFormats || {};

  return (
    <div className={s.timelineWrapper}>
      <ul className={s.timeline}>
        <li>
          <small>{t('JOB.ADDED_AT')}</small>
          <time>{formatDate(job.timestamp || 0, i18n.language, dateFormats)}</time>
        </li>
        {!!job.delay && job.delay > 0 && status === STATUSES.delayed && (
          <li>
            <small>{t('JOB.WILL_RUN_AT')}</small>
            <time>
              {formatDate(
                (job.timestamp || 0) + (job.opts.delay || job.delay || 0),
                i18n.language,
                dateFormats
              )}
            </time>
            {job.delay !== job.opts.delay && <small>{t('JOB.DELAY_CHANGED')} </small>}
          </li>
        )}
        {!!job.processedOn && (
          <li>
            <small>
              {!!job.delay && job.delay > 0 && t('JOB.DELAYED_FOR') + ' '}
              {formatDuration(job.processedOn, job.timestamp || 0, t)}
            </small>
            <small>{t('JOB.PROCESS_STARTED_AT')}</small>
            <time>{formatDate(job.processedOn, i18n.language, dateFormats)}</time>
            {!!job.processedBy && (
              <small>{t('JOB.PROCESSED_BY', { processedBy: job.processedBy })}</small>
            )}
          </li>
        )}
        {!!job.finishedOn && (
          <li>
            <small>{formatDuration(job.finishedOn, job.processedOn || 0, t)}</small>
            <small>
              {t(job.isFailed && status !== STATUSES.active ? `JOB.FAILED_AT` : 'JOB.FINISHED_AT')}
            </small>
            <time>{formatDate(job.finishedOn, i18n.language, dateFormats)}</time>
          </li>
        )}
      </ul>
    </div>
  );
};
