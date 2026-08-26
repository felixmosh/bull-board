import type { AppJob, Status } from '@bull-board/api/typings/app';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Details } from '../../src/components/JobCard/Details/Details';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, render } from '../testUtils';

// The real module spins up a web worker through `import.meta.url`, which Jest cannot parse.
jest.mock('../../src/utils/highlight/highlight', () => ({
  asyncHighlight: (code: string) => Promise.resolve(code),
}));

const job = {
  id: '1',
  name: 'process',
  data: { hello: 'world' },
  returnValue: null,
  opts: { attempts: 3 },
  progress: 0,
  stacktrace: [],
  failedReason: '',
} as unknown as AppJob;

async function renderDetails(status: Status = 'completed') {
  const { Wrapper } = createWrapper({ api: {} });
  const result = render(
    <Details status={status} job={job} actions={{ getJobLogs: () => Promise.resolve([]) }} />,
    { wrapper: Wrapper }
  );

  // Highlight renders asynchronously via asyncHighlight(...).then(setCode).
  // Flush the microtask so the state update is wrapped in act().
  await act(async () => {
    // Two microtasks: one for asyncHighlight's Promise.resolve and one for
    // its .then(setCode). A macrotask guarantees both have flushed.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return result;
}

beforeEach(() => {
  act(() => {
    useSettingsStore.setState({ collapseJobData: false, useCollapsibleJson: false });
  });
});

it('exposes the tab strip as a tablist with a single selected tab', async () => {
  await renderDetails();

  const tabs = screen.getAllByRole('tab');

  expect(screen.getByRole('tablist')).toBeTruthy();
  expect(tabs.map((tab) => tab.textContent)).toEqual([
    'JOB.TABS.DATA',
    'JOB.TABS.PROGRESS',
    'JOB.TABS.OPTIONS',
    'JOB.TABS.LOGS',
    'JOB.TABS.ERROR',
  ]);
  expect(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true')).toHaveLength(1);
});

it('links the visible panel back to the tab that opened it', async () => {
  await renderDetails();

  const panel = screen.getByRole('tabpanel');
  const selectedTab = screen.getByRole('tab', { selected: true });

  expect(panel.getAttribute('aria-labelledby')).toBe(selectedTab.getAttribute('id'));
  expect(selectedTab.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
});

it('moves between tabs with the arrow keys', async () => {
  const user = userEvent.setup();
  await renderDetails();

  await user.tab();
  await user.keyboard('{ArrowRight}{Enter}');

  await waitFor(() =>
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('JOB.TABS.PROGRESS')
  );
  expect(screen.getByText('JOB.NO_PROGRESS')).toBeTruthy();
});

it('keeps only the selected tab panel mounted', async () => {
  const user = userEvent.setup();
  await renderDetails();

  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);

  await user.click(screen.getByRole('tab', { name: 'JOB.TABS.OPTIONS' }));

  await waitFor(() => expect(screen.getByText(/attempts/)).toBeTruthy());
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
});

it('opens a failed job on its error tab', async () => {
  await renderDetails('failed');

  expect(screen.getByRole('tab', { selected: true }).textContent).toBe('JOB.TABS.ERROR');
  expect(screen.getAllByRole('tab')[0].textContent).toBe('JOB.TABS.ERROR');
});
