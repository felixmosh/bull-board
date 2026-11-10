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
    const light = header.querySelector('img')!;
    const dark = header.querySelector('source')!;

    expect(light.getAttribute('src')).toBe('/logo-light.svg');
    expect(light.getAttribute('width')).toBe('24');
    expect(dark.getAttribute('srcSet')).toBe('/logo-dark.svg');
    expect(dark.getAttribute('width')).toBe('120');
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
    const image = header.querySelector('img')!;

    expect(image.getAttribute('src')).toBe('/logo.svg');
    expect(image.getAttribute('height')).toBe('32');
  });

  it('does not render a picture when boardLogo is false', () => {
    const header = renderHeader({ boardLogo: false });
    expect(header.querySelector('picture')).toBeNull();
  });

  it('renders only a picture with img (no source) for a single path logo', () => {
    const header = renderHeader({ boardLogo: { path: '/logo.svg' } });
    const picture = header.querySelector('picture');
    expect(picture).toBeTruthy();
    expect(picture!.querySelectorAll('img')).toHaveLength(1);
    expect(picture!.querySelector('source')).toBeNull();
  });

  it('renders only a picture with img (no source) for light-only logo', () => {
    const header = renderHeader({ boardLogo: { light: { path: '/logo.svg' } } });
    const picture = header.querySelector('picture');
    expect(picture).toBeTruthy();
    expect(picture!.querySelectorAll('img')).toHaveLength(1);
    expect(picture!.querySelector('source')).toBeNull();
  });

  it('renders img + source for light + dark logo with width', () => {
    const header = renderHeader({
      boardLogo: {
        light: { path: '/logo-light.svg' },
        dark: { path: '/logo-dark.svg', width: 120 },
      },
    });
    const picture = header.querySelector('picture')!;
    expect(picture.querySelector('img')).toBeTruthy();
    expect(picture.querySelector('source')).toBeTruthy();
  });

  it('does not render source when theme is light', () => {
    act(() => {
      useSettingsStore.setState({ theme: 'light' });
    });
    const header = renderHeader({
      boardLogo: {
        light: { path: '/logo-light.svg' },
        dark: { path: '/logo-dark.svg', width: 120 },
      },
    });
    expect(header.querySelector('picture')!.querySelector('source')).toBeNull();
  });

  it('hides the environment badge when the setting is off', () => {
    useSettingsStore.setState({ showEnvBadge: false });
    const header = renderHeader({ environment: { label: 'production', color: '#b91c1c' } });

    expect(screen.queryByText('production')).toBeNull();
    expect(header.className).not.toMatch(/withEnvBadge/);
    expect(headerOffset()).toBe('');
  });
});
