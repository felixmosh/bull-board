import type { AppQueue } from '@bull-board/api/typings/app';
import type { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { StatusLegend } from '../../src/components/StatusLegend/StatusLegend';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0, jobsPerPage: 10 });
});

const ALL_STATUSES: AppQueue['statuses'] = [
  'active',
  'waiting',
  'waiting-children',
  'prioritized',
  'completed',
  'failed',
  'delayed',
  'paused',
];

const noCounts: AppQueue['counts'] = {
  active: 0,
  waiting: 0,
  'waiting-children': 0,
  prioritized: 0,
  completed: 0,
  failed: 0,
  delayed: 0,
  paused: 0,
  latest: 0,
};

function renderLegend(queues: GetQueuesResponse['queues']) {
  const api = { getQueues: jest.fn(() => Promise.resolve({ queues })) };
  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  const { container } = render(<StatusLegend />, { wrapper: Wrapper });

  /* Queried by href rather than accessible name: the labels are translation keys in
     cimode, so "WAITING" is a prefix of "WAITING-CHILDREN". */
  const countFor = (status: string) => {
    const tab = container.querySelector(`a[href="/?status=${status}"]`);
    if (!tab) {
      throw new Error(`no legend tab rendered for "${status}"`);
    }
    return tab.querySelector('.badge')?.textContent?.trim() ?? null;
  };

  return { countFor };
}

it('sums each status across every queue', async () => {
  const { countFor } = renderLegend([
    makeQueue('Q1', {
      statuses: ALL_STATUSES,
      counts: {
        ...noCounts,
        active: 2,
        waiting: 5,
        'waiting-children': 1,
        prioritized: 3,
        completed: 100,
        failed: 4,
        delayed: 7,
      },
    }),
    makeQueue('Q2', {
      statuses: ALL_STATUSES,
      counts: { ...noCounts, active: 1, completed: 50, failed: 6, paused: 9 },
    }),
  ]);

  await waitFor(() => expect(countFor('active')).toBe('3'));
  expect(countFor('waiting')).toBe('5');
  expect(countFor('waiting-children')).toBe('1');
  expect(countFor('completed')).toBe('150');
  expect(countFor('failed')).toBe('10');
  expect(countFor('paused')).toBe('9');
});

it('renders no count for a status nothing is sitting in', async () => {
  const { countFor } = renderLegend([
    makeQueue('Q1', { statuses: ALL_STATUSES, counts: { ...noCounts, waiting: 4 } }),
  ]);

  await waitFor(() => expect(countFor('waiting')).toBe('4'));
  expect(countFor('active')).toBeNull();
  expect(countFor('failed')).toBeNull();
});

it('ignores counts for statuses a queue does not report', async () => {
  const { countFor } = renderLegend([
    // Bull has no prioritized or waiting-children state, so those are missing from
    // `statuses` even when `counts` carries a value for them.
    makeQueue('Legacy', {
      statuses: ['waiting', 'completed', 'failed'],
      counts: {
        ...noCounts,
        active: 99,
        'waiting-children': 99,
        prioritized: 99,
        waiting: 1,
        completed: 2,
        failed: 3,
      },
    }),
  ]);

  await waitFor(() => expect(countFor('waiting')).toBe('1'));
  expect(countFor('active')).toBeNull();
  expect(countFor('prioritized')).toBeNull();
});
