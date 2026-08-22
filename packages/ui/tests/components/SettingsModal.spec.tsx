import { act, fireEvent, screen } from '@testing-library/react';
import i18n from 'i18next';
import { SettingsModal } from '../../src/components/SettingsModal/SettingsModal';
import { useSettingsStore } from '../../src/hooks/useSettings';
import { createWrapper, render } from '../testUtils';

async function renderWithLanguage(language: string) {
  act(() => {
    useSettingsStore.setState({ language });
  });

  const { Wrapper } = createWrapper({ api: {} });
  await act(async () => {
    render(<SettingsModal open onClose={() => {}} />, { wrapper: Wrapper });
  });

  return screen.getByRole('combobox', { name: /LANGUAGE/ });
}

describe('SettingsModal', () => {
  beforeEach(async () => {
    await act(() => i18n.changeLanguage('en-US'));
  });

  afterEach(async () => {
    useSettingsStore.setState({ showEnvBadge: true });
    await act(() => i18n.changeLanguage('cimode'));
  });

  it('shows the active language when nothing has been chosen yet', async () => {
    expect((await renderWithLanguage('')).textContent).toBe('en-US');
  });

  it('shows the stored language once one has been chosen', async () => {
    expect((await renderWithLanguage('de-DE')).textContent).toBe('de-DE');
  });

  it('hides the environment badge toggle when no environment is configured', async () => {
    const { Wrapper } = createWrapper({ api: {} });
    await act(async () => {
      render(<SettingsModal open onClose={() => {}} />, { wrapper: Wrapper });
    });

    expect(screen.queryByRole('switch', { name: /SHOW_ENV_BADGE/ })).toBeNull();
  });

  it('shows the environment badge toggle when an environment is configured', async () => {
    const { Wrapper } = createWrapper({
      api: {},
      uiConfig: { environment: { label: 'staging', color: '#f59f00' } },
    });
    await act(async () => {
      render(<SettingsModal open onClose={() => {}} />, { wrapper: Wrapper });
    });

    expect(screen.getByRole('switch', { name: /SHOW_ENV_BADGE/ })).toBeTruthy();
  });

  it('stores the environment badge preference', async () => {
    useSettingsStore.setState({ showEnvBadge: true });
    const { Wrapper } = createWrapper({
      api: {},
      uiConfig: { environment: { label: 'staging', color: '#f59f00' } },
    });
    await act(async () => {
      render(<SettingsModal open onClose={() => {}} />, { wrapper: Wrapper });
    });

    fireEvent.click(screen.getByRole('switch', { name: /SHOW_ENV_BADGE/ }));

    expect(useSettingsStore.getState().showEnvBadge).toBe(false);
  });
});
