import type { GetQueuesResponse } from '@bull-board/api/typings/responses';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { useConfirm } from '../../src/hooks/useConfirm';
import { useQueues } from '../../src/hooks/useQueues';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, deferred, Deferred, makeQueue } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
  });
});

it('exposes loading until the first response, then the mapped queues', async () => {
  const call = deferred<GetQueuesResponse>();
  const api = { getQueues: jest.fn(() => call.promise) };
  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/queue/Q1?status=waiting'] }),
  });

  const { result } = renderHook(() => useQueues(), { wrapper: Wrapper });

  expect(result.current.loading).toBe(true);
  expect(result.current.queues).toBeNull();

  await act(async () => {
    call.resolve({ queues: [makeQueue('Q1')] });
  });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.queues).toHaveLength(1);
  expect(result.current.queues?.[0].name).toBe('Q1');
});

it('defaults a missing displayName to the queue name', async () => {
  const call = deferred<GetQueuesResponse>();
  const api = { getQueues: jest.fn(() => call.promise) };
  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/queue/Q1'] }),
  });

  const { result } = renderHook(() => useQueues(), { wrapper: Wrapper });
  await act(async () => {
    call.resolve({ queues: [makeQueue('Q1', { displayName: undefined })] });
  });

  await waitFor(() => expect(result.current.queues).not.toBeNull());
  expect(result.current.queues?.[0].displayName).toBe('Q1');
});

it('flags isTransitioning while a status switch is in flight, then clears it', async () => {
  const calls: Deferred<GetQueuesResponse>[] = [];
  const api = {
    getQueues: jest.fn(() => {
      const call = deferred<GetQueuesResponse>();
      calls.push(call);
      return call.promise;
    }),
  };
  const history = createMemoryHistory({ initialEntries: ['/queue/Q1?status=waiting'] });
  const { Wrapper } = createWrapper({ api, history });

  const { result } = renderHook(() => useQueues(), { wrapper: Wrapper });

  await act(async () => {
    calls[0].resolve({ queues: [makeQueue('Q1', { jobs: [{ id: 'waiting-job' } as any] })] });
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.isTransitioning).toBe(false);

  act(() => {
    history.push('/queue/Q1?status=completed');
  });

  await waitFor(() => expect(result.current.isTransitioning).toBe(true));
  expect(result.current.queues?.[0].jobs[0].id).toBe('waiting-job');

  await act(async () => {
    calls[calls.length - 1].resolve({
      queues: [makeQueue('Q1', { jobs: [{ id: 'completed-job' } as any] })],
    });
  });

  await waitFor(() => expect(result.current.isTransitioning).toBe(false));
  expect(result.current.queues?.[0].jobs[0].id).toBe('completed-job');
});

it('refetches after a queue mutation resolves', async () => {
  const call = deferred<GetQueuesResponse>();
  const api = {
    getQueues: jest.fn(() => Promise.resolve({ queues: [makeQueue('Q1')] })),
    pauseQueue: jest.fn(() => Promise.resolve()),
  };
  api.getQueues.mockImplementationOnce(() => call.promise);

  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/queue/Q1?status=waiting'] }),
  });
  const { result } = renderHook(() => useQueues(), { wrapper: Wrapper });

  await act(async () => {
    call.resolve({ queues: [makeQueue('Q1')] });
  });
  await waitFor(() => expect(result.current.loading).toBe(false));

  const initialCalls = api.getQueues.mock.calls.length;

  await act(async () => {
    await result.current.actions.pauseQueue('Q1')();
  });

  expect(api.pauseQueue).toHaveBeenCalledWith('Q1');
  await waitFor(() => expect(api.getQueues.mock.calls.length).toBeGreaterThan(initialCalls));
});

it('retries failed jobs in every queue it is given, then refetches', async () => {
  const call = deferred<GetQueuesResponse>();
  const api = {
    getQueues: jest.fn(() => Promise.resolve({ queues: [makeQueue('Q1')] })),
    retryAll: jest.fn(() => Promise.resolve()),
  };
  api.getQueues.mockImplementationOnce(() => call.promise);

  const { Wrapper } = createWrapper({ api });
  const { result } = renderHook(() => useQueues(), { wrapper: Wrapper });

  await act(async () => {
    call.resolve({ queues: [makeQueue('Q1'), makeQueue('Q2')] });
  });
  await waitFor(() => expect(result.current.loading).toBe(false));

  const initialCalls = api.getQueues.mock.calls.length;

  await act(async () => {
    await result.current.actions.retryFailedInQueues({
      queueNames: ['Q1', 'Q2'],
      jobCount: 7,
    })();
  });

  expect(api.retryAll.mock.calls).toEqual([
    ['Q1', 'failed'],
    ['Q2', 'failed'],
  ]);
  await waitFor(() => expect(api.getQueues.mock.calls.length).toBeGreaterThan(initialCalls));
});

describe('obliterate', () => {
  function renderObliterateFlow(active = 3) {
    const queue = makeQueue('Q1');
    const api = {
      getQueues: jest.fn(() =>
        Promise.resolve({ queues: [{ ...queue, counts: { ...queue.counts, active } }] })
      ),
      obliterateQueue: jest.fn(() => Promise.resolve()),
    };
    const { Wrapper } = createWrapper({ api });

    const rendered = renderHook(() => ({ queues: useQueues(), confirm: useConfirm() }), {
      wrapper: Wrapper,
    });

    return { api, ...rendered };
  }

  /** The action reads the active count off the loaded queues, so wait for the first response. */
  async function waitForQueues(result: { current: { queues: { loading: boolean } } }) {
    await waitFor(() => expect(result.current.queues.loading).toBe(false));
  }

  // `confirmQueueActions` is off in this suite, so this also proves the prompt is unconditional.
  it('offers the force checkbox and obliterates without force when it is left alone', async () => {
    const { api, result } = renderObliterateFlow();
    await waitForQueues(result);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.queues.actions.obliterateQueue('Q1')();
    });

    await waitFor(() => expect(result.current.confirm.confirmProps.open).toBe(true));
    expect(result.current.confirm.confirmProps.checkbox).toEqual({
      label: 'QUEUE.ACTIONS.CONFIRM.OBLITERATE_FORCE',
      description: 'QUEUE.ACTIONS.CONFIRM.OBLITERATE_FORCE_DESCRIPTION',
    });

    await act(async () => {
      result.current.confirm.confirmProps.onConfirm({ checked: false });
      await pending;
    });

    expect(api.obliterateQueue).toHaveBeenCalledWith('Q1', false);
  });

  it('passes force through when the checkbox is ticked', async () => {
    const { api, result } = renderObliterateFlow();
    await waitForQueues(result);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.queues.actions.obliterateQueue('Q1')();
    });

    await waitFor(() => expect(result.current.confirm.confirmProps.open).toBe(true));

    await act(async () => {
      result.current.confirm.confirmProps.onConfirm({ checked: true });
      await pending;
    });

    expect(api.obliterateQueue).toHaveBeenCalledWith('Q1', true);
  });

  it('does not obliterate when the prompt is dismissed', async () => {
    const { api, result } = renderObliterateFlow();
    await waitForQueues(result);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.queues.actions.obliterateQueue('Q1')();
    });

    await waitFor(() => expect(result.current.confirm.confirmProps.open).toBe(true));

    await act(async () => {
      result.current.confirm.confirmProps.onCancel();
      await pending;
    });

    expect(api.obliterateQueue).not.toHaveBeenCalled();
  });

  // Nothing to force past, so the confirm stays the plain one it has always been.
  it('leaves the force checkbox out when no job is active', async () => {
    const { api, result } = renderObliterateFlow(0);
    await waitForQueues(result);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.queues.actions.obliterateQueue('Q1')();
    });

    await waitFor(() => expect(result.current.confirm.confirmProps.open).toBe(true));
    expect(result.current.confirm.confirmProps.checkbox).toBeUndefined();

    await act(async () => {
      result.current.confirm.confirmProps.onConfirm();
      await pending;
    });

    expect(api.obliterateQueue).toHaveBeenCalledWith('Q1', false);
  });
});
