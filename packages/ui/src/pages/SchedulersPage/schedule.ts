import type { AppJobScheduler } from '@bull-board/api/typings/app';
import { TFunction } from 'i18next';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * An `every` interval as a duration a person reads at a glance. Anything that does not divide
 * evenly keeps the smaller unit rather than rounding, so 90 minutes stays 90 minutes.
 */
export const formatInterval = (every: number, t: TFunction): string => {
  if (every % DAY === 0) {
    return t('SCHEDULERS.INTERVAL.DAYS', { count: every / DAY });
  }
  if (every % HOUR === 0) {
    return t('SCHEDULERS.INTERVAL.HOURS', { count: every / HOUR });
  }
  if (every % MINUTE === 0) {
    return t('SCHEDULERS.INTERVAL.MINUTES', { count: every / MINUTE });
  }
  if (every % 1000 === 0) {
    return t('SCHEDULERS.INTERVAL.SECONDS', { count: every / 1000 });
  }
  return t('SCHEDULERS.INTERVAL.MILLISECONDS', { count: every });
};

export const describeSchedule = (scheduler: AppJobScheduler, t: TFunction): string => {
  if (scheduler.pattern) {
    return scheduler.pattern;
  }
  if (scheduler.every) {
    return t('SCHEDULERS.EVERY', { interval: formatInterval(scheduler.every, t) });
  }
  return '-';
};
