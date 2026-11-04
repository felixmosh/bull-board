import type { AppJob } from '@bull-board/api/typings/app';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBuilder } from '../../src/components/JobFilters/FilterBuilder';
import { render } from '../testUtils';

const jobs = [
  { data: { email: 'a@hoopay.com.br', amount: 10 }, returnValue: null },
] as unknown as AppJob[];

const fieldInputs = () => screen.getAllByRole('combobox', { name: 'QUEUE.FILTERS.BUILDER_FIELD' });

it('builds the search from the rows and applies it', async () => {
  const user = userEvent.setup();
  const onApply = jest.fn();
  render(<FilterBuilder jobs={jobs} onApply={onApply} />);

  const apply = screen.getByRole('button', { name: 'QUEUE.FILTERS.BUILDER_APPLY' });
  expect((apply as HTMLButtonElement).disabled).toBe(true);

  await user.type(fieldInputs()[0], 'data.email');
  await user.click(screen.getByRole('combobox', { name: 'QUEUE.FILTERS.BUILDER_OPERATOR' }));
  await user.click(await screen.findByRole('option', { name: 'ILIKE' }));
  await user.type(
    screen.getByRole('textbox', { name: 'QUEUE.FILTERS.BUILDER_VALUE' }),
    '%@hoopay.com.br'
  );

  await user.click(screen.getByRole('button', { name: /BUILDER_ADD/ }));
  await user.type(fieldInputs()[1], 'data.amount');
  await user.type(screen.getAllByRole('textbox', { name: 'QUEUE.FILTERS.BUILDER_VALUE' })[1], '5');

  const expected = "data.email ILIKE '%@hoopay.com.br' AND data.amount = 5";
  expect(screen.getByText(expected)).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'QUEUE.FILTERS.BUILDER_APPLY' }));
  await waitFor(() => expect(onApply).toHaveBeenCalledWith(expected));
});

it('drops the value input for IS NULL and offers fields from the jobs', async () => {
  const user = userEvent.setup();
  const { container } = render(<FilterBuilder jobs={jobs} onApply={jest.fn()} />);

  const options = [...container.querySelectorAll('datalist option')].map(
    (option) => (option as HTMLOptionElement).value
  );
  expect(options).toEqual(expect.arrayContaining(['name', 'data.email', 'data.amount']));

  await user.type(fieldInputs()[0], 'data.coupon');
  await user.click(screen.getByRole('combobox', { name: 'QUEUE.FILTERS.BUILDER_OPERATOR' }));
  await user.click(await screen.findByRole('option', { name: 'QUEUE.FILTERS.BUILDER_OP_IS_NULL' }));

  expect(screen.queryByRole('textbox', { name: 'QUEUE.FILTERS.BUILDER_VALUE' })).toBeNull();
  expect(screen.getByText('data.coupon IS NULL')).toBeTruthy();
});
