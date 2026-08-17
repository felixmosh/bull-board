import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SelectField } from '../../src/components/Form/SelectField/SelectField';
import { render } from '../testUtils';

const options = [
  { text: 'Newest first', value: 'desc' },
  { text: 'Oldest first', value: 'asc' },
];

it('selects an option with the keyboard', async () => {
  const user = userEvent.setup();
  const onChange = jest.fn();
  render(
    <SelectField
      label="Order"
      id="order"
      options={options}
      defaultValue="desc"
      onChange={onChange}
    />
  );

  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: 'Oldest first' }));

  await waitFor(() => expect(onChange).toHaveBeenCalledWith('asc'));
});

it('submits its value as part of the surrounding form', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn((event) => {
    event.preventDefault();
    expect(new FormData(event.currentTarget).get('order')).toBe('asc');
  });

  render(
    <form onSubmit={onSubmit}>
      <SelectField label="Order" id="order" name="order" options={options} defaultValue="asc" />
      <button type="submit">Save</button>
    </form>
  );

  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
});

it('exposes an accessible name from aria-label when no visible label is rendered', async () => {
  render(
    <SelectField
      id="scheduler-queue-filter"
      aria-label="Order"
      options={options}
      defaultValue="desc"
    />
  );

  expect(screen.getByRole('combobox', { name: 'Order' })).toBeTruthy();
});
