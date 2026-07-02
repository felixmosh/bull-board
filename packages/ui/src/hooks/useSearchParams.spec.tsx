import { renderHook } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { PropsWithChildren } from 'react';
import { Router } from 'react-router-dom';
import { parseStatus, useSearchParams } from './useSearchParams';

describe('parseStatus', () => {
  it('returns the value for a known status', () => {
    expect(parseStatus('completed')).toBe('completed');
    expect(parseStatus('waiting-children')).toBe('waiting-children');
  });

  it('returns null for unknown, empty, or missing values', () => {
    expect(parseStatus('bogus')).toBeNull();
    expect(parseStatus('')).toBeNull();
    expect(parseStatus(null)).toBeNull();
    expect(parseStatus(undefined)).toBeNull();
  });
});

describe('useSearchParams', () => {
  const wrapperFor = (url: string) => {
    const history = createMemoryHistory({ initialEntries: [url] });
    return ({ children }: PropsWithChildren<unknown>) => (
      <Router history={history}>{children}</Router>
    );
  };

  it('parses status and page from the URL', () => {
    const { result } = renderHook(() => useSearchParams(), {
      wrapper: wrapperFor('/queue/Q1?status=failed&page=3'),
    });
    expect(result.current.status).toBe('failed');
    expect(result.current.page).toBe('3');
  });

  it('defaults page to "1" and status to null when absent', () => {
    const { result } = renderHook(() => useSearchParams(), {
      wrapper: wrapperFor('/queue/Q1'),
    });
    expect(result.current.page).toBe('1');
    expect(result.current.status).toBeNull();
  });

  it('rejects an invalid status rather than passing it through', () => {
    const { result } = renderHook(() => useSearchParams(), {
      wrapper: wrapperFor('/queue/Q1?status=not-a-status'),
    });
    expect(result.current.status).toBeNull();
  });
});
