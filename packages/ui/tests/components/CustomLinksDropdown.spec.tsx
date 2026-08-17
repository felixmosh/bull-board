import type { UIConfig } from '@bull-board/api/typings/app';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { CustomLinksDropdown } from '../../src/components/CustomLinksDropdown/CustomLinksDropdown';
import { render } from '../testUtils';

async function openDropdown(options: UIConfig['miscLinks']) {
  render(<CustomLinksDropdown className="trigger" options={options} />);

  fireEvent.click(screen.getAllByRole('button')[0]);
  await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
}

function itemNamed(text: string) {
  return screen.getByText(text).closest('[role="menuitem"]');
}

it('renders a link per option', async () => {
  await openDropdown([
    { text: 'Logout', url: '/logout' },
    { text: 'Docs', url: 'https://example.com/docs' },
  ]);

  expect(itemNamed('Logout')?.getAttribute('href')).toBe('/logout');
  expect(itemNamed('Docs')?.getAttribute('href')).toBe('https://example.com/docs');
});

it('shows the icon of an option that has one', async () => {
  await openDropdown([
    { text: 'Logout', url: '/logout', icon: 'https://cdn.example.com/logout.svg' },
  ]);

  const icon = itemNamed('Logout')?.querySelector('img');

  expect(icon?.getAttribute('src')).toBe('https://cdn.example.com/logout.svg');
  // The link text already says what the item does, so repeating it would only add noise for a
  // screen reader.
  expect(icon?.getAttribute('alt')).toBe('');
});

it('renders no image for an option without an icon', async () => {
  await openDropdown([{ text: 'Logout', url: '/logout' }]);

  expect(itemNamed('Logout')?.querySelector('img')).toBeNull();
});
