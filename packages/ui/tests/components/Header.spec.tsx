import { screen } from '@testing-library/react';
import { Header } from '../../src/components/Header/Header';
import { createWrapper, render } from '../testUtils';

function renderHeader(uiConfig: Parameters<typeof createWrapper>[0]['uiConfig']) {
  const { Wrapper } = createWrapper({ api: {}, uiConfig });
  render(
    <Header>
      <h1>Charges</h1>
    </Header>,
    { wrapper: Wrapper }
  );
  return document.querySelector('header')!;
}

describe('Header', () => {
  /**
   * The badge is absolutely positioned across the top of the header and takes no space, so
   * without a class to hang the reservation off, the header's centred content sits under it.
   * That is what clipped the top of the queue title once the header shrank to 64px.
   */
  it('marks itself so the content can reserve room for the environment badge', () => {
    const header = renderHeader({ environment: { label: 'production', color: '#b91c1c' } });

    expect(screen.getByText('production')).toBeTruthy();
    expect(header.className).toMatch(/withEnvBadge/);
  });

  it('reserves nothing when no environment is configured', () => {
    const header = renderHeader({});

    expect(screen.queryByText('production')).toBeNull();
    expect(header.className).not.toMatch(/withEnvBadge/);
  });

  it('carries the badge variables on the header, where the content can read them too', () => {
    const header = renderHeader({
      environment: { label: 'staging', color: '#f59f00', textColor: '#000', fontSize: '1rem' },
    });

    expect(header.style.getPropertyValue('--badge-bg')).toBe('#f59f00');
    expect(header.style.getPropertyValue('--badge-color')).toBe('#000');
    expect(header.style.getPropertyValue('--badge-font-size')).toBe('1rem');
  });
});
