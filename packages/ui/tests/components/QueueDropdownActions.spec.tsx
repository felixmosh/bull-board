import type { AppQueue } from '@bull-board/api/typings/app';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ConfirmModal } from '../../src/components/ConfirmModal/ConfirmModal';
import { QueueDropdownActions } from '../../src/components/QueueDropdownActions/QueueDropdownActions';
import { useConfirm } from '../../src/hooks/useConfirm';
import { useQueueActions } from '../../src/hooks/useQueueActions';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, makeQueue, render } from '../testUtils';

beforeEach(() => {
  useSettingsStore.setState({
    pollingInterval: 0,
    jobsPerPage: 10,
    confirmQueueActions: false,
  });
});

function CardMenu({ queue }: { queue: AppQueue }) {
  const actions = useQueueActions();
  const { confirmProps } = useConfirm();

  return (
    <>
      <QueueDropdownActions queue={queue} actions={{ ...actions, addJob: () => {} }} />
      <ConfirmModal {...confirmProps} />
    </>
  );
}

it('offers to force the obliterate from the active count on the card', async () => {
  const queue = makeQueue('Q1');
  const api = { obliterateQueue: jest.fn(() => Promise.resolve()) };
  const { Wrapper } = createWrapper({ api });

  render(
    <CardMenu queue={{ ...queue, isPaused: true, counts: { ...queue.counts, active: 3 } }} />,
    { wrapper: Wrapper }
  );

  fireEvent.click(screen.getAllByRole('button')[0]);
  fireEvent.click(await screen.findByText('QUEUE.ACTIONS.OBLITERATE'));

  expect(await screen.findByText('QUEUE.ACTIONS.CONFIRM.OBLITERATE_FORCE')).toBeTruthy();

  fireEvent.click(screen.getByText('CONFIRM.CANCEL_BTN'));
});

it('keeps obliterate out of reach until the queue is paused', async () => {
  const api = { obliterateQueue: jest.fn(() => Promise.resolve()) };
  const { Wrapper } = createWrapper({ api });

  render(<CardMenu queue={{ ...makeQueue('Q1'), isPaused: false }} />, { wrapper: Wrapper });

  fireEvent.click(screen.getAllByRole('button')[0]);
  const item = (await screen.findByText('QUEUE.ACTIONS.OBLITERATE')).closest('[role="menuitem"]')!;
  fireEvent.click(item);

  expect(item.getAttribute('aria-disabled')).toBe('true');
  expect(screen.queryByText('QUEUE.ACTIONS.CONFIRM.OBLITERATE_QUEUE')).toBeNull();
  expect(api.obliterateQueue).not.toHaveBeenCalled();
});

it('names the obliterate after the action and starts on cancel', async () => {
  const { Wrapper } = createWrapper({ api: { obliterateQueue: jest.fn() } });

  render(<CardMenu queue={{ ...makeQueue('Q1'), isPaused: true }} />, { wrapper: Wrapper });

  fireEvent.click(screen.getAllByRole('button')[0]);
  fireEvent.click(await screen.findByText('QUEUE.ACTIONS.OBLITERATE'));

  const dialog = await screen.findByRole('alertdialog');
  await waitFor(() => expect(document.activeElement?.textContent).toBe('CONFIRM.CANCEL_BTN'));
  expect(within(dialog).getByRole('button', { name: 'QUEUE.ACTIONS.OBLITERATE' })).toBeTruthy();
});
