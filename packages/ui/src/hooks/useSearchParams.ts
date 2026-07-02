import { STATUSES } from '@bull-board/api/constants/statuses';
import { useLocation } from 'react-router-dom';
import { Status } from '../../typings/app';

const statusValues = new Set<string>(Object.values(STATUSES));

function isStatus(value: string): value is Status {
  return statusValues.has(value);
}

export function parseStatus(value: string | null | undefined): Status | null {
  return value && isStatus(value) ? value : null;
}

export interface UISearchParams {
  status: Status | null;
  page: string;
  raw: URLSearchParams;
}

export function useSearchParams(): UISearchParams {
  const raw = new URLSearchParams(useLocation().search);
  return {
    status: parseStatus(raw.get('status')),
    page: raw.get('page') || '1',
    raw,
  };
}
