import type { AppJob } from '@bull-board/api/typings/app';
import type { GetJobResponse } from '@bull-board/api/typings/responses';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { useConfirm } from '../../src/hooks/useConfirm';
import { useJob } from '../../src/hooks/useJob';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, deferred, Deferred, MockApi } from '../testUtils';

function makeJobResponse(id: string): GetJobResponse {
  return { job: { id, name: 'process' } as AppJob, status: 'completed' };
}

beforeEach(() => {
  useSettingsStore.setState({ pollingInterval: 0, jobsPerPage: 10, confirmJobActions: false });
});

it('does not fetch until a job id is present in the route', async () => {
  const api = {
    getJob: jest.fn(() => Promise.resolve(makeJobResponse('1'))),
    getQueues: jest.fn(() => Promise.resolve({ queues: [] })),
  };
  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/queue/Q1'] }),
  });

  renderHook(() => useJob(), { wrapper: Wrapper });

  expect(api.getJob).not.toHaveBeenCalled();
});

it('loads a job once the route carries a job id', async () => {
  const call = deferred<GetJobResponse>();
  const api = {
    getJob: jest.fn(() => call.promise),
    getQueues: jest.fn(() => Promise.resolve({ queues: [] })),
  };
  const { Wrapper } = createWrapper({
    api,
    history: createMemoryHistory({ initialEntries: ['/queue/Q1/42'] }),
  });

  const { result } = renderHook(() => useJob(), { wrapper: Wrapper });
  expect(result.current.loading).toBe(true);

  await act(async () => {
    call.resolve(makeJobResponse('42'));
  });

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(api.getJob).toHaveBeenCalledWith('Q1', '42');
  expect(result.current.job?.id).toBe('42');
  expect(result.current.status).toBe('completed');
});

it('flags isTransitioning while switching between jobs, then clears it', async () => {
  const calls: Deferred<GetJobResponse>[] = [];
  const api = {
    getJob: jest.fn(() => {
      const call = deferred<GetJobResponse>();
      calls.push(call);
      return call.promise;
    }),
    getQueues: jest.fn(() => Promise.resolve({ queues: [] })),
  };
  const history = createMemoryHistory({ initialEntries: ['/queue/Q1/1'] });
  const { Wrapper } = createWrapper({ api, history });

  const { result } = renderHook(() => useJob(), { wrapper: Wrapper });

  await act(async () => {
    calls[0].resolve(makeJobResponse('1'));
  });
  await waitFor(() => expect(result.current.job?.id).toBe('1'));
  expect(result.current.isTransitioning).toBe(false);

  act(() => {
    history.push('/queue/Q1/2');
  });

  await waitFor(() => expect(result.current.isTransitioning).toBe(true));
  expect(result.current.job?.id).toBe('1');

  await act(async () => {
    calls[calls.length - 1].resolve(makeJobResponse('2'));
  });

  await waitFor(() => expect(result.current.isTransitioning).toBe(false));
  expect(result.current.job?.id).toBe('2');
});

describe('cleaning a job that belongs to a job scheduler', () => {
  const scheduledJob = { id: 'repeat:nightly-report:1784', name: 'report' } as AppJob;

  // What the API answers with when the job is the run a scheduler is waiting on.
  const belongsToScheduler = {
    error: 'Job belongs to a job scheduler',
    message: 'Job repeat:nightly-report:1784 is the next run of job scheduler nightly-report...',
    code: 'JOB_BELONGS_TO_JOB_SCHEDULER',
    jobSchedulerId: 'nightly-report',
  };

  function renderCleanFlow(api: MockApi) {
    const { Wrapper } = createWrapper({
      api: {
        getJob: jest.fn(() => Promise.resolve(makeJobResponse(scheduledJob.id as string))),
        getQueues: jest.fn(() => Promise.resolve({ queues: [] })),
        ...api,
      },
      history: createMemoryHistory({ initialEntries: [`/queue/Q1/${scheduledJob.id}`] }),
    });

    return renderHook(() => ({ job: useJob(), confirm: useConfirm() }), { wrapper: Wrapper });
  }

  it('removes an ordinary job without asking about schedules', async () => {
    const api = {
      cleanJob: jest.fn(() => Promise.resolve(undefined)),
      removeJobScheduler: jest.fn(() => Promise.resolve()),
    };
    const { result } = renderCleanFlow(api);

    await act(async () => {
      await result.current.job.actions.cleanJob('Q1')(scheduledJob)();
    });

    expect(api.cleanJob).toHaveBeenCalledWith('Q1', scheduledJob.id);
    expect(api.removeJobScheduler).not.toHaveBeenCalled();
    expect(result.current.confirm.confirmProps.open).toBe(false);
  });

  // `confirmJobActions` is off here, so this proves the schedule prompt is unconditional.
  it('asks before removing the schedule, then removes it on confirm', async () => {
    const api = {
      cleanJob: jest.fn(() => Promise.resolve(belongsToScheduler)),
      removeJobScheduler: jest.fn(() => Promise.resolve()),
    };
    const { result } = renderCleanFlow(api);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.job.actions.cleanJob('Q1')(scheduledJob)();
    });

    await waitFor(() => expect(result.current.confirm.confirmProps.open).toBe(true));
    expect(result.current.confirm.confirmProps.description).toBe(
      'JOB.ACTIONS.CONFIRM.REMOVE_JOB_SCHEDULER'
    );
    expect(api.removeJobScheduler).not.toHaveBeenCalled();

    await act(async () => {
      result.current.confirm.confirmProps.onConfirm();
      await pending;
    });

    expect(api.removeJobScheduler).toHaveBeenCalledWith('Q1', 'nightly-report');
  });

  it('leaves the schedule alone when the prompt is dismissed', async () => {
    const api = {
      cleanJob: jest.fn(() => Promise.resolve(belongsToScheduler)),
      removeJobScheduler: jest.fn(() => Promise.resolve()),
    };
    const { result } = renderCleanFlow(api);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.job.actions.cleanJob('Q1')(scheduledJob)();
    });

    await waitFor(() => expect(result.current.confirm.confirmProps.open).toBe(true));

    await act(async () => {
      result.current.confirm.confirmProps.onCancel();
      await pending;
    });

    expect(api.removeJobScheduler).not.toHaveBeenCalled();
  });
});
