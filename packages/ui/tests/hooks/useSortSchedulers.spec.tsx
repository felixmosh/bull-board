import type { AppJobScheduler } from '@bull-board/api/typings/app';
import { act, renderHook } from '@testing-library/react';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { useSortQueues } from '../../src/hooks/useSortQueues';
import { sortSchedulers, useSortSchedulers } from '../../src/hooks/useSortSchedulers';

beforeEach(() => {
  useSettingsStore.setState({
    sorting: {
      dashboard: { key: 'alphabetical', direction: 'asc' },
      schedulers: { key: 'next', direction: 'asc' },
    },
  });
});

function makeScheduler(id: string, overrides: Partial<AppJobScheduler> = {}): AppJobScheduler {
  return { id, queueName: 'reports', name: 'report', ...overrides };
}

const ids = (schedulers: AppJobScheduler[]) => schedulers.map((scheduler) => scheduler.id);

describe('sortSchedulers', () => {
  const schedulers = [
    makeScheduler('weekly', { next: 3_000, lastRun: 1_000 }),
    makeScheduler('hourly', { next: 1_000, lastRun: 2_000 }),
    makeScheduler('pending', { next: 2_000 }),
  ];

  it('orders by the next run in both directions', () => {
    expect(ids(sortSchedulers(schedulers, 'next', 'asc'))).toEqual(['hourly', 'pending', 'weekly']);
    expect(ids(sortSchedulers(schedulers, 'next', 'desc'))).toEqual([
      'weekly',
      'pending',
      'hourly',
    ]);
  });

  it('orders text columns alphabetically', () => {
    expect(ids(sortSchedulers(schedulers, 'id', 'asc'))).toEqual(['hourly', 'pending', 'weekly']);
  });

  it('keeps a scheduler without a value last in both directions', () => {
    expect(ids(sortSchedulers(schedulers, 'lastRun', 'asc'))).toEqual([
      'weekly',
      'hourly',
      'pending',
    ]);
    expect(ids(sortSchedulers(schedulers, 'lastRun', 'desc'))).toEqual([
      'hourly',
      'weekly',
      'pending',
    ]);
  });

  it('orders the queue column by the label it shows', () => {
    const labels: Record<string, string> = { 'emails-v2': 'Emails', 'reports-v2': 'Billing' };
    const byQueue = [
      makeScheduler('digest', { queueName: 'emails-v2' }),
      makeScheduler('invoice', { queueName: 'reports-v2' }),
    ];

    expect(
      ids(sortSchedulers(byQueue, 'queueName', 'asc', (scheduler) => labels[scheduler.queueName]))
    ).toEqual(['invoice', 'digest']);
  });

  it('does not reorder the list it was given', () => {
    sortSchedulers(schedulers, 'next', 'asc');

    expect(ids(schedulers)).toEqual(['weekly', 'hourly', 'pending']);
  });
});

it('flips the direction when the same column is picked again', () => {
  const schedulers = [
    makeScheduler('later', { next: 2_000 }),
    makeScheduler('sooner', { next: 1_000 }),
  ];
  const { result } = renderHook(() => useSortSchedulers(schedulers));

  expect(ids(result.current.sortedSchedulers)).toEqual(['sooner', 'later']);

  act(() => result.current.onSort('next'));

  expect(result.current.sortDirection).toBe('desc');
  expect(ids(result.current.sortedSchedulers)).toEqual(['later', 'sooner']);
});

it('keeps the dashboard sort when the schedulers sort changes, and the other way around', () => {
  const { result: schedulersSort } = renderHook(() => useSortSchedulers([]));
  const { result: queuesSort } = renderHook(() => useSortQueues([]));

  act(() => queuesSort.current.onSort('failed'));
  act(() => schedulersSort.current.onSort('lastRun'));

  expect(useSettingsStore.getState().sorting).toEqual({
    dashboard: { key: 'failed', direction: 'asc' },
    schedulers: { key: 'lastRun', direction: 'asc' },
  });
});
