import { screen } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Pagination } from '../../src/components/Pagination/Pagination';
import { createWrapper, render } from '../testUtils';

it('links each page to the current queue path with its query', () => {
  const { Wrapper } = createWrapper({
    api: {},
    history: createMemoryHistory({ initialEntries: ['/queue/Q1?status=failed&page=2'] }),
  });

  render(<Pagination pageCount={3} />, { wrapper: Wrapper });

  expect(screen.getByRole('link', { name: 'Page 1' }).getAttribute('href')).toBe(
    '/queue/Q1?status=failed'
  );
  expect(screen.getByRole('link', { name: 'Page 3' }).getAttribute('href')).toBe(
    '/queue/Q1?page=3&status=failed'
  );
});
