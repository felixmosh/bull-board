import { fireEvent, screen } from '@testing-library/react';
import { OverviewControls } from '../../src/components/OverviewControls/OverviewControls';
import { useOverviewState } from '../../src/hooks/useMenuState';
import { createWrapper, render } from '../testUtils';

beforeEach(() => {
  useOverviewState.setState({ state: {} });
});

function renderControls() {
  const { Wrapper } = createWrapper({ api: {}, uiConfig: {} });
  render(<OverviewControls grouped groupPaths={['billing', 'emails']} />, { wrapper: Wrapper });
  return {
    expand: screen.getByTitle('MENU.EXPAND_ALL'),
    collapse: screen.getByTitle('MENU.COLLAPSE_ALL'),
  };
}

it('renders nothing when the overview is not grouped', () => {
  const { Wrapper } = createWrapper({ api: {}, uiConfig: {} });
  const { container } = render(<OverviewControls grouped={false} groupPaths={['billing']} />, {
    wrapper: Wrapper,
  });

  expect(container.textContent).toBe('');
});

it('reflects the collapse state of every group path it is given', () => {
  const { expand, collapse } = renderControls();

  expect(expand.hasAttribute('disabled')).toBe(true);
  expect(collapse.hasAttribute('disabled')).toBe(false);

  fireEvent.click(collapse);

  expect(useOverviewState.getState().state).toEqual({ billing: false, emails: false });
  expect(expand.hasAttribute('disabled')).toBe(false);
  expect(collapse.hasAttribute('disabled')).toBe(true);

  fireEvent.click(expand);

  expect(expand.hasAttribute('disabled')).toBe(true);
  expect(collapse.hasAttribute('disabled')).toBe(false);
});
