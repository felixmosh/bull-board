import { screen, act } from '@testing-library/react';
import { Header } from '../../src/components/Header/Header';
import { useSettingsStore } from '../../src/hooks/useSettings';
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

const headerOffset = () => document.body.style.getPropertyValue('--header-offset');

describe('Header', () => {
  afterEach(() => {
    act(() => {
      useSettingsStore.setState({ showEnvBadge: true });
    });
  });

  it('grows the header offset by the height of the environment badge', () => {
    const header = renderHeader({ environment: { label: 'production', color: '#b91c1c' } });

    expect(screen.getByText('production')).toBeTruthy();
    expect(header.className).toMatch(/withEnvBadge/);
    expect(headerOffset()).toBe('calc(var(--header-height) + calc(0.75rem * 1.5))');
  });

  it('measures the badge with the configured font size', () => {
    renderHeader({ environment: { label: 'staging', color: '#f59f00', fontSize: '1rem' } });

    expect(headerOffset()).toBe('calc(var(--header-height) + calc(1rem * 1.5))');
  });

  it('leaves the header offset alone when no environment is configured', () => {
    const header = renderHeader({});

    expect(screen.queryByText('production')).toBeNull();
    expect(header.className).not.toMatch(/withEnvBadge/);
    expect(headerOffset()).toBe('');
  });

  it('carries the badge variables on the header, where the content can read them too', () => {
    const header = renderHeader({
      environment: { label: 'staging', color: '#f59f00', textColor: '#000', fontSize: '1rem' },
    });

    expect(header.style.getPropertyValue('--badge-bg')).toBe('#f59f00');
    expect(header.style.getPropertyValue('--badge-color')).toBe('#000');
    expect(header.style.getPropertyValue('--badge-font-size')).toBe('1rem');
  });

  it('hides the environment badge when the setting is off', () => {
    useSettingsStore.setState({ showEnvBadge: false });
    const header = renderHeader({ environment: { label: 'production', color: '#b91c1c' } });

    expect(screen.queryByText('production')).toBeNull();
    expect(header.className).not.toMatch(/withEnvBadge/);
    expect(headerOffset()).toBe('');
  });
});
