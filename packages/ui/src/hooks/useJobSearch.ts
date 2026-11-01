import { DEFAULT_SEARCH_SCAN_LIMIT } from '@bull-board/api/constants/jobSearch';
import type { JobSearchField, JobSearchMatch } from '@bull-board/api/typings/app';
import { useHistory, useLocation } from 'react-router-dom';

export interface JobSearchParams {
  search: string;
  searchIn: JobSearchField;
  match: JobSearchMatch;
  caseSensitive: boolean;
  scanLimit: number;
}

export const JOB_SEARCH_FIELDS: JobSearchField[] = [
  'all',
  'id',
  'name',
  'data',
  'dataKey',
  'dataValue',
  'error',
  'returnValue',
  'opts',
];

export const JOB_SEARCH_MATCHES: JobSearchMatch[] = ['contains', 'exact', 'glob', 'regex'];

export const JOB_SEARCH_SCAN_LIMITS = [500, 1000, 5000, 10000, 50000];

export const JOB_SEARCH_DEFAULTS: JobSearchParams = {
  search: '',
  searchIn: 'all',
  match: 'contains',
  caseSensitive: false,
  scanLimit: DEFAULT_SEARCH_SCAN_LIMIT,
};

/** The URL keys the search lives under, carried along when the status tab changes. */
export const JOB_SEARCH_KEYS = ['search', 'searchIn', 'match', 'caseSensitive', 'scanLimit'];

function pick<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  return value && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export function readJobSearch(raw: URLSearchParams): JobSearchParams {
  const scanLimit = Number(raw.get('scanLimit'));
  return {
    search: raw.get('search') ?? JOB_SEARCH_DEFAULTS.search,
    searchIn: pick(raw.get('searchIn'), JOB_SEARCH_FIELDS, JOB_SEARCH_DEFAULTS.searchIn),
    match: pick(raw.get('match'), JOB_SEARCH_MATCHES, JOB_SEARCH_DEFAULTS.match),
    caseSensitive: raw.get('caseSensitive') === 'true',
    scanLimit: JOB_SEARCH_SCAN_LIMITS.includes(scanLimit)
      ? scanLimit
      : JOB_SEARCH_DEFAULTS.scanLimit,
  };
}

/** Copies the search keys of `from` onto `search`, so switching status keeps the filter. */
export function carryJobSearch(search: string, from: string): string {
  const source = new URLSearchParams(from);
  const target = new URLSearchParams(search);
  JOB_SEARCH_KEYS.forEach((key) => {
    const value = source.get(key);
    if (value !== null) {
      target.set(key, value);
    }
  });
  return target.toString();
}

export function useJobSearch(): [JobSearchParams, (patch: Partial<JobSearchParams>) => void] {
  const { search, pathname } = useLocation();
  const history = useHistory();
  const params = readJobSearch(new URLSearchParams(search));

  const update = (patch: Partial<JobSearchParams>) => {
    const next = { ...params, ...patch };
    const query = new URLSearchParams(search);

    JOB_SEARCH_KEYS.forEach((key) => {
      const value = next[key as keyof JobSearchParams];
      if (value === JOB_SEARCH_DEFAULTS[key as keyof JobSearchParams] || value === '') {
        query.delete(key);
      } else {
        query.set(key, `${value}`);
      }
    });
    // A new filter yields a new result set, so the old page number no longer means anything.
    query.delete('page');
    query.sort();

    history.replace({ pathname, search: query.toString() });
  };

  return [params, update];
}
