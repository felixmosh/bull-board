import { act, renderHook } from '@testing-library/react';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { useSortQueues } from '../../src/hooks/useSortQueues';
import { makeQueue } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({ sorting: { dashboard: { key: 'alphabetical', direction: 'asc' } } });
});

const queues = [
  { ...makeQueue('beta'), displayName: 'beta' },
  { ...makeQueue('alpha'), displayName: 'alpha' },
];

it('re-sorts when the sort key changes', () => {
  const { result } = renderHook(() => useSortQueues(queues));

  expect(result.current.sortedQueues.map((queue) => queue.displayName)).toEqual(['alpha', 'beta']);

  act(() => result.current.onSort('alphabetical'));

  expect(result.current.sortDirection).toBe('desc');
  expect(result.current.sortedQueues.map((queue) => queue.displayName)).toEqual(['beta', 'alpha']);
});
