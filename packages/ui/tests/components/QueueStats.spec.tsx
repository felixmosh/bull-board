import type { AppQueue } from '@bull-board/api/typings/app';
import { createMemoryHistory } from 'history';
import { QueueStats } from '../../src/components/QueueCard/QueueStats/QueueStats';
import { createWrapper, makeQueue, render } from '../testUtils';

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

function renderStats(counts: Partial<AppQueue['counts']>) {
  const queue = makeQueue('Emails.Welcome', {
    statuses: ALL_STATUSES,
    counts: { ...noCounts, ...counts },
  });

  const { Wrapper } = createWrapper({
    api: {},
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  const { container } = render(<QueueStats queue={queue} />, { wrapper: Wrapper });

  return {
    container,
    flagFor: (status: string) => container.querySelector(`a[href*="status=${status}"]`),
    breakdownTrigger: () => container.querySelector('button[aria-label]'),
    segments: () => container.querySelectorAll('.bar'),
  };
}

it('shows both flags when jobs are processing and failing', () => {
  const { flagFor } = renderStats({ active: 3, failed: 7, completed: 40 });

  expect(flagFor('active')?.textContent).toContain('3');
  expect(flagFor('failed')?.textContent).toContain('7');
});

it('hides the active flag when nothing is processing', () => {
  const { flagFor } = renderStats({ failed: 2, completed: 40 });

  expect(flagFor('active')).toBeNull();
  expect(flagFor('failed')?.textContent).toContain('2');
});

it('hides the failed flag when there are no failures', () => {
  const { flagFor } = renderStats({ active: 1, completed: 40 });

  expect(flagFor('active')?.textContent).toContain('1');
  expect(flagFor('failed')).toBeNull();
});

it('links each flag to that status view of the queue', () => {
  const { flagFor } = renderStats({ active: 1, failed: 1 });

  expect(flagFor('active')?.getAttribute('href')).toContain('/queue/Emails.Welcome');
  expect(flagFor('failed')?.getAttribute('href')).toContain('status=failed');
});

it('renders one pulse segment per status holding jobs', () => {
  const { segments } = renderStats({ active: 1, completed: 40, failed: 2, delayed: 5 });

  expect(segments()).toHaveLength(4);
});

it('offers a breakdown trigger named after the job total', () => {
  const { breakdownTrigger } = renderStats({ completed: 40, failed: 2 });

  expect(breakdownTrigger()?.getAttribute('aria-label')).toBe('DASHBOARD.JOBS_COUNT');
});

it('drops the breakdown trigger for an empty queue, since there is nothing to break down', () => {
  const { breakdownTrigger, flagFor, segments } = renderStats({});

  expect(breakdownTrigger()).toBeNull();
  expect(segments()).toHaveLength(0);
  expect(flagFor('active')).toBeNull();
  expect(flagFor('failed')).toBeNull();
});
