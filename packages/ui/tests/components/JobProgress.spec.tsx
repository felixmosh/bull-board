import { render, screen } from '@testing-library/react';
import { Progress } from '../../src/components/JobCard/Progress/Progress';

it('reports the completion percentage to assistive technology', () => {
  render(<Progress progress={42} status="active" />);

  const progressbar = screen.getByRole('progressbar');

  expect(progressbar.getAttribute('aria-valuenow')).toBe('42');
  expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
  expect(progressbar.getAttribute('aria-valuemax')).toBe('100');
});

it('reads the percentage out of the object form of progress', () => {
  render(<Progress progress={{ progress: 70, note: 'resizing' }} status="active" />);

  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('70');
});

it('renders nothing when the job reports no progress', () => {
  const { container } = render(<Progress progress={null} status="active" />);

  expect(container.firstChild).toBeNull();
});
