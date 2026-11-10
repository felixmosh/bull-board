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

  it('renders a separate logo per theme, each with its own size', () => {
    const header = renderHeader({
      boardLogo: {
        light: { path: '/logo-light.svg', width: 24 },
        dark: { path: '/logo-dark.svg', width: 120 },
      },
    });
    const [light, dark] = Array.from(header.querySelectorAll('img'));

    expect(light.getAttribute('src')).toBe('/logo-light.svg');
    expect(light.getAttribute('width')).toBe('24');
    expect(light.className).toMatch(/lightOnly/);
    expect(dark.getAttribute('src')).toBe('/logo-dark.svg');
    expect(dark.getAttribute('width')).toBe('120');
    expect(dark.className).toMatch(/darkOnly/);
  });

  it('uses the light logo for both themes when dark is omitted', () => {
    const header = renderHeader({ boardLogo: { light: { path: '/logo.svg' } } });
    const images = header.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe('/logo.svg');
    expect(images[0].className).not.toMatch(/lightOnly/);
  });

  it('still accepts a single logo object for both themes', () => {
    const header = renderHeader({ boardLogo: { path: '/logo.svg', height: 32 } });
    const images = header.querySelectorAll('img');

    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe('/logo.svg');
    expect(images[0].getAttribute('height')).toBe('32');
  });

  it('hides the environment badge when the setting is off', () => {
    useSettingsStore.setState({ showEnvBadge: false });
    const header = renderHeader({ environment: { label: 'production', color: '#b91c1c' } });

    expect(screen.queryByText('production')).toBeNull();
    expect(header.className).not.toMatch(/withEnvBadge/);
    expect(headerOffset()).toBe('');
  });
});
