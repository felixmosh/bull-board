import { fireEvent, screen, waitFor } from '@testing-library/react';
import { HoverPanel } from '../../src/components/HoverPanel/HoverPanel';
import { createWrapper, render } from '../testUtils';

const rows = [
  { id: 'failed', color: 'red', label: 'Failed', value: 6, to: '/queue/test?status=failed' },
];

function renderPanel() {
  const { Wrapper } = createWrapper({ api: {} });
  render(
    <HoverPanel rows={rows} triggerLabel="559 jobs">
      <span>strip</span>
    </HoverPanel>,
    { wrapper: Wrapper }
  );

  return screen.getByRole('button', { name: '559 jobs' });
}

/**
 * PreviewCard opens on hover, which a touch screen does not have. Without a press to fall back
 * on, the breakdown is unreachable on a phone.
 */
it('opens on a touch press', async () => {
  const trigger = renderPanel();

  fireEvent.pointerUp(trigger, { pointerType: 'touch' });

  await waitFor(() => expect(screen.getByText('Failed')).toBeTruthy());
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
});

it('closes on a second touch press', async () => {
  const trigger = renderPanel();

  fireEvent.pointerUp(trigger, { pointerType: 'touch' });
  await waitFor(() => expect(screen.getByText('Failed')).toBeTruthy());

  fireEvent.pointerUp(trigger, { pointerType: 'touch' });

  await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'));
});

/* A mouse already has hover, and toggling on click would close the panel under the pointer. */
it('leaves mouse presses to the hover interaction', async () => {
  const trigger = renderPanel();

  fireEvent.pointerUp(trigger, { pointerType: 'mouse' });

  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('Failed')).toBeNull();
});
