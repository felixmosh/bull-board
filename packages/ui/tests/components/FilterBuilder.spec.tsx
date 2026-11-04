import type { AppJob } from '@bull-board/api/typings/app';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterBuilder } from '../../src/components/JobFilters/FilterBuilder';
import { createWrapper, render } from '../testUtils';

const jobs = [
  { data: { email: 'a@hoopay.com.br', amount: 10 }, returnValue: null },
] as unknown as AppJob[];

const lastCompleted = {
  id: '42',
  name: 'webhook',
  timestamp: 1_700_000_000_000,
  finishedOn: 1_700_000_001_000,
  data: { payload: { organizationId: 77, code: '0012' }, coupon: null, tags: ['pix'] },
  returnValue: { ok: true },
};

const renderBuilder = (onApply = jest.fn(), completed: unknown[] = [lastCompleted]) => {
  const getQueues = jest.fn(() =>
    Promise.resolve({ queues: [{ name: 'Checkout-Order', jobs: completed }] })
  );
  const { Wrapper } = createWrapper({ api: { getQueues } as any });
  const view = render(<FilterBuilder queueName="Checkout-Order" jobs={jobs} onApply={onApply} />, {
    wrapper: Wrapper,
  });
  return { ...view, getQueues };
};

const fieldInputs = () => screen.getAllByRole('combobox', { name: 'QUEUE.FILTERS.BUILDER_FIELD' });

it('builds the search from the rows and applies it', async () => {
  const user = userEvent.setup();
  const onApply = jest.fn();
  renderBuilder(onApply);

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
  const { container } = renderBuilder();

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

it('reads the last completed job and turns its fields into conditions', async () => {
  const user = userEvent.setup();
  const onApply = jest.fn();
  const { getQueues } = renderBuilder(onApply);

  await screen.findByText('data.payload.organizationId');
  expect(getQueues).toHaveBeenCalledWith(
    expect.objectContaining({ activeQueue: 'Checkout-Order', status: 'completed', jobsPerPage: 1 })
  );
  expect(screen.getByText(/#42/)).toBeTruthy();

  // The first pick fills the blank row, the next ones add rows.
  await user.click(screen.getByText('data.payload.organizationId').closest('button')!);
  await user.click(screen.getByText('data.payload.code').closest('button')!);
  await user.click(screen.getByText('data.coupon').closest('button')!);
  await user.click(screen.getByText('data.tags').closest('button')!);

  expect(fieldInputs()).toHaveLength(4);
  const expected =
    "data.payload.organizationId = 77 AND data.payload.code = '0012' AND data.coupon IS NULL AND data.tags LIKE 'pix'";
  expect(screen.getByText(expected)).toBeTruthy();

  await user.click(screen.getByRole('button', { name: 'QUEUE.FILTERS.BUILDER_APPLY' }));
  await waitFor(() => expect(onApply).toHaveBeenCalledWith(expected));
});

it('says so when the queue has no completed job', async () => {
  renderBuilder(jest.fn(), []);
  expect(await screen.findByText('QUEUE.FILTERS.BUILDER_SAMPLE_EMPTY')).toBeTruthy();
});
