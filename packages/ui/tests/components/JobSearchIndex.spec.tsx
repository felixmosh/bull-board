import { act, screen, waitFor } from '@testing-library/react';
import { JobSearchIndex } from '../../src/components/JobSearchIndex/JobSearchIndex';
import { createWrapper, MockApi, render } from '../testUtils';

function renderSection(api: MockApi) {
  const { Wrapper } = createWrapper({ api });
  return render(<JobSearchIndex queueName="orders" jobId="7" />, { wrapper: Wrapper });
}

it('renders one row per field with its state', async () => {
  const getJobSearchInspection = jest.fn(() =>
    Promise.resolve({
      fields: [
        { field: 'data.tenantId', values: ['acme'], indexed: true },
        { field: 'data.email', values: [], indexed: false },
      ],
    })
  );
  renderSection({
    getSearchFields: () =>
      Promise.resolve({
        fields: ['data.tenantId', 'data.email'],
        diagnostics: { status: true, inspect: true, coverage: false },
      }),
    getJobSearchInspection,
  });

  expect(await screen.findByText('data.tenantId')).toBeTruthy();
  expect(screen.getByText('data.email')).toBeTruthy();
  expect(screen.getByText('acme')).toBeTruthy();
  expect(screen.getByText('JOB.SEARCH_INDEX.NO_VALUE')).toBeTruthy();
  expect(screen.getByText('JOB.SEARCH_INDEX.INDEXED')).toBeTruthy();
  expect(screen.getByText('JOB.SEARCH_INDEX.NOT_INDEXED')).toBeTruthy();
  expect(getJobSearchInspection).toHaveBeenCalledWith('orders', '7');
});

it('renders nothing without inspect', async () => {
  const getJobSearchInspection = jest.fn();
  const getSearchFields = jest.fn(() =>
    Promise.resolve({
      fields: ['data.tenantId'],
      diagnostics: { status: true, inspect: false, coverage: false },
    })
  );
  renderSection({ getSearchFields, getJobSearchInspection });

  await waitFor(() => expect(getSearchFields).toHaveBeenCalled());
  await act(async () => {
    await getSearchFields.mock.results[0].value;
  });
  expect(screen.queryByText('JOB.SEARCH_INDEX.TITLE')).toBeNull();
  expect(getJobSearchInspection).not.toHaveBeenCalled();
});
