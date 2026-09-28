import type { AppQueue } from '@bull-board/api/typings/app';
import { fireEvent, screen } from '@testing-library/react';
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

  render(<CardMenu queue={{ ...queue, counts: { ...queue.counts, active: 3 } }} />, {
    wrapper: Wrapper,
  });

  fireEvent.click(screen.getAllByRole('button')[0]);
  fireEvent.click(await screen.findByText('QUEUE.ACTIONS.OBLITERATE'));

  expect(await screen.findByText('QUEUE.ACTIONS.CONFIRM.OBLITERATE_FORCE')).toBeTruthy();

  fireEvent.click(screen.getByText('CONFIRM.CANCEL_BTN'));
});
