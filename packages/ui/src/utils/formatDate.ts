import type { DateFormats } from '@bull-board/api/typings/app';
import { isSameYear, isToday } from 'date-fns';

export type TimeStamp = number | Date;

/**
 * Absolute timestamp, shortened by how far away it is: a time for today, a date and time within
 * the year, the year included beyond that. `dateFormats` from `uiConfig` overrides each case.
 */
export const formatDate = (
  ts: TimeStamp,
  locale: string,
  customDateFormats: DateFormats = {}
): string => {
  let options: Intl.DateTimeFormatOptions;

  if (isToday(ts)) {
    if (customDateFormats?.short) {
      return new Intl.DateTimeFormat(locale, customDateFormats.short).format(ts);
    }
    options = {
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    };
  } else if (isSameYear(ts, new Date())) {
    if (customDateFormats?.common) {
      return new Intl.DateTimeFormat(locale, customDateFormats.common).format(ts);
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
      return new Intl.DateTimeFormat(locale, customDateFormats.full).format(ts);
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

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 1000],
  ['minute', 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
];

/** "in 5 minutes" / "2 hours ago", in the dashboard's language. */
export const formatRelativeToNow = (ts: TimeStamp, locale: string, now = Date.now()): string => {
  const diff = new Date(ts).getTime() - now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  let [unit, ms] = RELATIVE_UNITS[0];
  for (const [candidateUnit, candidateMs] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= candidateMs) {
      [unit, ms] = [candidateUnit, candidateMs];
    }
  }

  // Rounded on the magnitude so a distance reads the same either side of now: JS rounds -1.5 to
  // -1, which would make 90 seconds ago "1 minute ago" and 90 seconds ahead "in 2 minutes".
  const value = Math.sign(diff) * Math.round(Math.abs(diff) / ms);

  return rtf.format(value, unit);
};
