import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from '../../src/components/Tooltip/Tooltip';
import { render } from '../testUtils';

it('opens on hover and names the trigger', async () => {
  const user = userEvent.setup();
  render(
    <Tooltip title="Retry this job">
      <button type="button">Retry</button>
    </Tooltip>
  );

  await user.hover(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(screen.getByText('Retry this job')).toBeTruthy());
});

it('opens on keyboard focus', async () => {
  const user = userEvent.setup();
  render(
    <Tooltip title="Retry this job">
      <button type="button">Retry</button>
    </Tooltip>
  );

  await user.tab();

  await waitFor(() => expect(screen.getByText('Retry this job')).toBeTruthy());
});

it('closes on escape', async () => {
  const user = userEvent.setup();
  render(
    <Tooltip title="Retry this job">
      <button type="button">Retry</button>
    </Tooltip>
  );

  await user.hover(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByText('Retry this job')).toBeTruthy());

  await user.keyboard('{Escape}');

  await waitFor(() => expect(screen.queryByText('Retry this job')).toBeNull());
});
