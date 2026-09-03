import type { FlowNode, JobFlow as JobFlowResponse } from '@bull-board/api/typings/app';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { JobFlow } from '../../src/components/JobFlow/JobFlow';
import { createWrapper, MockApi, render } from '../testUtils';

function makeNode(
  id: string,
  children: FlowNode[] = [],
  overrides: Partial<FlowNode> = {}
): FlowNode {
  return {
    id,
    name: `job-${id}`,
    state: 'waiting',
    progress: 0,
    queueName: 'q',
    children,
    ...overrides,
  };
}

function renderFlow(flow: JobFlowResponse, api: MockApi = {}) {
  const history = createMemoryHistory({ initialEntries: ['/queue/q/1'] });
  const { Wrapper } = createWrapper({
    api: { getJobFlow: jest.fn().mockResolvedValue(flow), ...api },
    history,
  });

  return { history, ...render(<JobFlow />, { wrapper: Wrapper }) };
}

describe('JobFlow', () => {
  it('renders nothing for a job that is not part of a flow', async () => {
    const { container } = renderFlow({ nodeId: '1', isFlowNode: false, flowRoot: null });

    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('renders a node per job in the flow', async () => {
    renderFlow({
      nodeId: '1',
      isFlowNode: true,
      flowRoot: makeNode('1', [makeNode('2'), makeNode('3')]),
    });

    expect(await screen.findAllByText('job-1')).not.toHaveLength(0);
    expect(await screen.findByText('job-2')).toBeTruthy();
    expect(await screen.findByText('job-3')).toBeTruthy();
  });

  it('titles the card with a translation key rather than hardcoded English', async () => {
    renderFlow({ nodeId: '1', isFlowNode: true, flowRoot: makeNode('1', [makeNode('2')]) });

    expect(await screen.findByText('JOB.FLOW.TITLE')).toBeTruthy();
  });

  it('loads the remaining children when a truncated node is expanded', async () => {
    const getJobFlow = jest
      .fn()
      .mockResolvedValueOnce({
        nodeId: '1',
        isFlowNode: true,
        flowRoot: makeNode('1', [
          makeNode('2', [], {
            truncated: true,
            dependencies: { processed: 0, unprocessed: 3, ignored: 0, failed: 0 },
          }),
        ]),
      })
      .mockResolvedValueOnce({
        nodeId: '2',
        isFlowNode: true,
        flowRoot: makeNode('2', [makeNode('3'), makeNode('4'), makeNode('5')]),
      });

    renderFlow({ nodeId: '1', isFlowNode: false, flowRoot: null }, { getJobFlow });

    await userEvent.click(await screen.findByText('JOB.FLOW.EXPAND'));

    expect(await screen.findByText('job-3')).toBeTruthy();
    expect(getJobFlow).toHaveBeenLastCalledWith('q', '2', {
      root: 'node',
      depth: 2,
      maxChildren: 1000,
    });
  });

  it('shows the clicked job in the panel without navigating', async () => {
    const getJob = jest.fn().mockResolvedValue({
      job: { id: '2', name: 'job-2', data: { hello: 'world' } },
      status: 'waiting',
    });

    const { history } = renderFlow(
      { nodeId: '1', isFlowNode: true, flowRoot: makeNode('1', [makeNode('2')]) },
      { getJob }
    );

    fireEvent.click(await screen.findByText('job-2'));

    expect(await screen.findByText('JOB.FLOW.OPEN_JOB')).toBeTruthy();
    await waitFor(() => expect(getJob).toHaveBeenCalledWith('q', '2'));
    expect(history.location.pathname).toBe('/queue/q/1');
  });

  it('toggles fullscreen and exits on Escape', async () => {
    renderFlow({ nodeId: '1', isFlowNode: true, flowRoot: makeNode('1', [makeNode('2')]) });

    await userEvent.click(await screen.findByRole('button', { name: 'JOB.FLOW.FULLSCREEN_ENTER' }));

    expect(await screen.findByRole('button', { name: 'JOB.FLOW.FULLSCREEN_EXIT' })).toBeTruthy();

    await userEvent.keyboard('{Escape}');

    expect(await screen.findByRole('button', { name: 'JOB.FLOW.FULLSCREEN_ENTER' })).toBeTruthy();
  });

  it('offers a control that centres the canvas on the job the page is for', async () => {
    renderFlow({ nodeId: '1', isFlowNode: true, flowRoot: makeNode('1', [makeNode('2')]) });

    expect(await screen.findByRole('button', { name: 'JOB.FLOW.FOCUS_JOB' })).toBeTruthy();
  });

  it('does not offer the focus control when the opened job is outside the loaded window', async () => {
    const history = createMemoryHistory({ initialEntries: ['/queue/q/999'] });
    const { Wrapper } = createWrapper({
      api: {
        getJobFlow: jest.fn().mockResolvedValue({
          nodeId: '999',
          isFlowNode: true,
          flowRoot: makeNode('1', [makeNode('2')]),
        }),
      },
      history,
    });

    render(<JobFlow />, { wrapper: Wrapper });

    await screen.findByText('job-2');
    expect(screen.queryByRole('button', { name: 'JOB.FLOW.FOCUS_JOB' })).toBeNull();
  });

  it('stops offering to expand a node that is still capped after expanding', async () => {
    const capped = makeNode(
      '1',
      Array.from({ length: 3 }, (_, i) => makeNode(`c${i}`)),
      {
        truncated: true,
        dependencies: { processed: 0, unprocessed: 9, ignored: 0, failed: 0 },
      }
    );

    const getJobFlow = jest
      .fn()
      .mockResolvedValueOnce({ nodeId: '1', isFlowNode: true, flowRoot: capped })
      .mockResolvedValue({ nodeId: '1', isFlowNode: true, flowRoot: capped });

    renderFlow({ nodeId: '1', isFlowNode: false, flowRoot: null }, { getJobFlow });

    await userEvent.click(await screen.findByText('JOB.FLOW.EXPAND'));

    expect(await screen.findByText('JOB.FLOW.CAPPED')).toBeTruthy();
    expect(screen.queryByText('JOB.FLOW.EXPAND')).toBeNull();
  });

  it('shows why a selected job failed, and how many attempts it had', async () => {
    const getJob = jest.fn().mockResolvedValue({
      job: {
        id: '2',
        name: 'job-2',
        data: {},
        attempts: 3,
        failedReason: 'ffmpeg exited with code 1: moov atom not found',
      },
      status: 'failed',
    });

    renderFlow(
      {
        nodeId: '1',
        isFlowNode: true,
        flowRoot: makeNode('1', [makeNode('2', [], { state: 'failed' })]),
      },
      { getJob }
    );

    fireEvent.click(await screen.findByText('job-2'));

    expect(await screen.findByText('JOB.FLOW.PANEL_ERROR')).toBeTruthy();
    expect(await screen.findByText('ffmpeg exited with code 1: moov atom not found')).toBeTruthy();
    expect(await screen.findByText('JOB.FLOW.PANEL_ATTEMPTS')).toBeTruthy();
  });

  it('leaves the failure block out for a job that did not fail', async () => {
    const getJob = jest
      .fn()
      .mockResolvedValue({ job: { id: '2', name: 'job-2', data: {} }, status: 'completed' });

    renderFlow(
      { nodeId: '1', isFlowNode: true, flowRoot: makeNode('1', [makeNode('2')]) },
      { getJob }
    );

    fireEvent.click(await screen.findByText('job-2'));
    await waitFor(() => expect(getJob).toHaveBeenCalledWith('q', '2'));

    expect(screen.queryByText('JOB.FLOW.PANEL_ERROR')).toBeNull();
    expect(screen.queryByText('JOB.FLOW.PANEL_ATTEMPTS')).toBeNull();
  });

  it('starts with the job the page is for selected', async () => {
    const getJob = jest
      .fn()
      .mockResolvedValue({ job: { id: '1', name: 'job-1', data: {} }, status: 'waiting' });

    renderFlow(
      { nodeId: '1', isFlowNode: true, flowRoot: makeNode('1', [makeNode('2')]) },
      { getJob }
    );

    await waitFor(() => expect(getJob).toHaveBeenCalledWith('q', '1'));
    expect(screen.queryByText('JOB.FLOW.NO_SELECTION')).toBeNull();
  });
});
