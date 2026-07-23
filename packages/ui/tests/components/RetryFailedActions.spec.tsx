import type { AppQueue } from '@bull-board/api/typings/app';
import type { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { OverviewActions } from '../../src/components/OverviewDropDownActions/OverviewDropDownActions';
import { QueueDropdownActions } from '../../src/components/QueueDropdownActions/QueueDropdownActions';
import { useSettingsStore } from '../../src/hooks/useSettings';
import type { QueueActions } from '../../typings/app';
import { createWrapper, makeQueueWithFailed as makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
  });
});

// Action creators are curried, so the separate handlers let a spec tell "wired up" from "clicked".
function stubActions() {
  const noop = () => () => Promise.resolve();
  const retryAllHandler = jest.fn(() => Promise.resolve());
  const retryFailedInQueuesHandler = jest.fn(() => Promise.resolve());

  const actions = {
    pauseAll: () => Promise.resolve(),
    resumeAll: () => Promise.resolve(),
    updateQueues: () => Promise.resolve(),
    retryAll: jest.fn(() => retryAllHandler),
    retryFailedInQueues: jest.fn(() => retryFailedInQueuesHandler),
    promoteAll: noop,
    cleanAll: noop,
    pauseQueue: noop,
    resumeQueue: noop,
    pauseQueues: noop,
    resumeQueues: noop,
    emptyQueue: noop,
    obliterateQueue: noop,
    addJob: noop,
    setGlobalConcurrency: noop,
  } as unknown as QueueActions;

  return { actions, retryAllHandler, retryFailedInQueuesHandler };
}

async function openMenu(element: React.ReactElement) {
  const api = { getQueues: jest.fn(() => Promise.resolve<GetQueuesResponse>({ queues: [] })) };
  const { Wrapper } = createWrapper({ api });
  render(element, { wrapper: Wrapper });
  fireEvent.click(screen.getAllByRole('button')[0]);
  await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
}

describe('queue card dropdown', () => {
  const renderCardMenu = async (queue: AppQueue) => {
    const stub = stubActions();
    await openMenu(
      <QueueDropdownActions
        queue={queue}
        actions={{ ...stub.actions, addJob: () => {}, onConcurrency: () => {} } as any}
      />
    );
    return stub;
  };

  it('retries the queue failed jobs when the item is clicked', async () => {
    const { actions, retryAllHandler } = await renderCardMenu(makeQueue('Q1', 3));

    fireEvent.click(screen.getByText('QUEUE.ACTIONS.RETRY_ALL_FAILED'));

    expect(actions.retryAll).toHaveBeenCalledWith('Q1', 'failed');
    expect(retryAllHandler).toHaveBeenCalled();
  });

  it('hides the retry action when nothing has failed', async () => {
    await renderCardMenu(makeQueue('Q1', 0));

    expect(screen.queryByText('QUEUE.ACTIONS.RETRY_ALL_FAILED')).toBeNull();
  });

  it('hides the retry action when the queue disallows retries', async () => {
    await renderCardMenu(makeQueue('Q1', 3, { allowRetries: false }));

    expect(screen.queryByText('QUEUE.ACTIONS.RETRY_ALL_FAILED')).toBeNull();
  });
});

describe('overview dropdown', () => {
  const renderOverviewMenu = async (queues: AppQueue[]) => {
    const stub = stubActions();
    await openMenu(
      <OverviewActions
        actions={stub.actions}
        queues={queues}
        onSort={() => {}}
        sortBy="alphabetical"
        sortDirection="asc"
      />
    );
    return stub;
  };

  it('retries only the queues that actually have failed jobs', async () => {
    const { actions, retryFailedInQueuesHandler } = await renderOverviewMenu([
      makeQueue('Q1', 2),
      makeQueue('Q2', 0),
      makeQueue('Q3', 7),
    ]);

    fireEvent.click(screen.getByText('QUEUE.ACTIONS.RETRY_FAILED_IN_ALL_QUEUES'));

    expect(actions.retryFailedInQueues).toHaveBeenCalledWith({
      queueNames: ['Q1', 'Q3'],
      jobCount: 9,
    });
    expect(retryFailedInQueuesHandler).toHaveBeenCalled();
  });

  it('hides the retry action when no queue has failed jobs', async () => {
    await renderOverviewMenu([makeQueue('Q1', 0), makeQueue('Q2', 0)]);

    expect(screen.queryByText('QUEUE.ACTIONS.RETRY_FAILED_IN_ALL_QUEUES')).toBeNull();
  });
});
