import { act, screen } from '@testing-library/react';
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
    await act(() => i18n.changeLanguage('cimode'));
  });

  it('shows the active language when nothing has been chosen yet', async () => {
    expect((await renderWithLanguage('')).textContent).toBe('en-US');
  });

  it('shows the stored language once one has been chosen', async () => {
    expect((await renderWithLanguage('de-DE')).textContent).toBe('de-DE');
  });
});
