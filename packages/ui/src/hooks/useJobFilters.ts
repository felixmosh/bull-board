import type { JobsOrder } from '@bull-board/api/typings/app';
import { useHistory, useLocation } from 'react-router-dom';

export interface JobFilters {
  jobId: string;
  order: JobsOrder;
  search: string;
}

export const JOB_FILTER_DEFAULTS: JobFilters = { jobId: '', order: 'desc', search: '' };

/** The URL keys the filters live under, carried along when the status tab changes. */
export const JOB_FILTER_KEYS = ['jobId', 'order', 'search'] as const;

export function readJobFilters(raw: URLSearchParams): JobFilters {
  return {
    jobId: raw.get('jobId') ?? JOB_FILTER_DEFAULTS.jobId,
    order: raw.get('order') === 'asc' ? 'asc' : 'desc',
    search: raw.get('search') ?? JOB_FILTER_DEFAULTS.search,
  };
}

export function hasActiveJobFilters(filters: JobFilters): boolean {
  return !!filters.jobId.trim() || !!filters.search.trim();
}

/** Copies the filter keys of `from` onto `search`, so switching status keeps the filters. */
export function carryJobFilters(search: string, from: string): string {
  const source = new URLSearchParams(from);
  const target = new URLSearchParams(search);
  JOB_FILTER_KEYS.forEach((key) => {
    const value = source.get(key);
    if (value !== null) {
      target.set(key, value);
    }
  });
  return target.toString();
}

export function useJobFilters(): [JobFilters, (patch: Partial<JobFilters>) => void] {
  const { search, pathname } = useLocation();
  const history = useHistory();
  const filters = readJobFilters(new URLSearchParams(search));

  const update = (patch: Partial<JobFilters>) => {
    const next = { ...filters, ...patch };
    const query = new URLSearchParams(search);

    JOB_FILTER_KEYS.forEach((key) => {
      const value = next[key];
      if (value === JOB_FILTER_DEFAULTS[key] || value === '') {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    });
    // Different filters give a different list, so the old page number no longer applies.
    query.delete('page');
    query.sort();

    history.replace({ pathname, search: query.toString() });
  };

  return [filters, update];
}
