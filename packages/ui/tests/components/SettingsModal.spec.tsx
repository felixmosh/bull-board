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

  afterEach(() => {
    act(() => {
      useSettingsStore.setState({ showEnvBadge: true });
      i18n.changeLanguage('cimode');
    });
  });

  it('shows the active language when nothing has been chosen yet', async () => {
    expect((await renderWithLanguage('')).textContent).toBe('en-US');
  });

  it('shows the stored language once one has been chosen', async () => {
    expect((await renderWithLanguage('de-DE')).textContent).toBe('de-DE');
  });

  it('shows the theme as a dropdown defaulting to the system option', async () => {
    act(() => {
      useSettingsStore.setState({ theme: 'system' });
    });

    const { Wrapper } = createWrapper({ api: {} });
    await act(async () => {
      render(<SettingsModal open onClose={() => {}} />, { wrapper: Wrapper });
    });

    expect(screen.getByRole('combobox', { name: 'SETTINGS.THEME' }).textContent).toBe(
      'SETTINGS.THEME_OPTIONS.SYSTEM'
    );
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

describe('read-only notification settings', () => {
  const settings = {
    enabled: true,
    prefixes: ['bull', 'production'],
    queues: ['emails', 'payments'],
    delivery: {
      appName: 'Production',
      boardUrl: 'https://queues.example.com/board',
      timeoutMs: 10000,
      maxAttempts: 3,
      retryDelayMs: 1000,
      maxPending: 200,
    },
    discord: { enabled: true, webhookConfigured: true, threadId: '321' },
    telegram: { enabled: true, botTokenConfigured: true, chatId: '-100123', messageThreadId: 42 },
  };
  it('shows the active config as text without editable controls', async () => {
    const { Wrapper } = createWrapper({ api: {}, uiConfig: { notificationSettings: settings } });
    await act(async () => {
      render(<SettingsModal open onClose={() => {}} />, { wrapper: Wrapper });
    });
    fireEvent.click(screen.getByRole('button', { name: 'SETTINGS.SECTIONS.NOTIFICATIONS' }));
    expect(screen.getByText('Production')).toBeTruthy();
    expect(screen.getByText('https://queues.example.com/board')).toBeTruthy();
    expect(screen.getByText('bull, production')).toBeTruthy();
    expect(screen.getByText('emails, payments')).toBeTruthy();
    expect(screen.getByText('-100123')).toBeTruthy();
    expect(screen.getByText('321')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('10000 ms')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
    expect(screen.getByText('SETTINGS.NOTIFICATIONS.READ_ONLY')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('shows disabled state and automatic queue discovery', async () => {
    const { Wrapper } = createWrapper({
      api: {},
      uiConfig: {
        notificationSettings: {
          ...settings,
          enabled: false,
          queues: null,
          delivery: null,
          discord: { enabled: false, webhookConfigured: false },
          telegram: { enabled: false, botTokenConfigured: false },
        },
      },
    });
    await act(async () => {
      render(<SettingsModal open onClose={() => {}} />, { wrapper: Wrapper });
    });
    fireEvent.click(screen.getByRole('button', { name: 'SETTINGS.SECTIONS.NOTIFICATIONS' }));
    expect(screen.getByText('SETTINGS.NOTIFICATIONS.INACTIVE')).toBeTruthy();
    expect(screen.getByText('SETTINGS.NOTIFICATIONS.ALL_QUEUES')).toBeTruthy();
    expect(screen.queryByText('Production')).toBeNull();
  });

  it('does not show a section on embedded boards with no CLI snapshot', async () => {
    const { Wrapper } = createWrapper({ api: {} });
    await act(async () => {
      render(<SettingsModal open onClose={() => {}} />, { wrapper: Wrapper });
    });
    expect(screen.queryByRole('button', { name: 'SETTINGS.SECTIONS.NOTIFICATIONS' })).toBeNull();
  });
});
