import type { UIConfig } from '@bull-board/api/typings/app';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ApiContext } from './hooks/useApi';
import './index.css';
import { useSettingsStore } from './hooks/useSettings';
import { UIConfigContext } from './hooks/useUIConfig';
import { Api } from './services/Api';
import './theme.css';
import './toastify.css';
import { initI18n } from './services/i18n';

const basePath = ((window as any).__basePath__ =
  document.head.querySelector('base')?.getAttribute('href') || '');
const api = new Api({ basePath });
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});
const uiConfig = JSON.parse(
  document.getElementById('__UI_CONFIG__')?.textContent || '{}'
) as UIConfig;

if (!!uiConfig.pollingInterval?.forceInterval) {
  useSettingsStore.setState({ pollingInterval: uiConfig.pollingInterval.forceInterval });
}

if (uiConfig.sortQueues != null) {
  useSettingsStore.setState({ sortQueues: uiConfig.sortQueues });
}

const settingsLang = useSettingsStore.getState().language;
const lng = settingsLang || uiConfig.locale?.lng || navigator.language || 'en-US';

initI18n({ lng, basePath }).then(() => {
  createRoot(document.getElementById('root')!).render(
    <BrowserRouter basename={basePath}>
      <QueryClientProvider client={queryClient}>
        <UIConfigContext.Provider value={uiConfig}>
          <ApiContext.Provider value={api}>
            <App />
          </ApiContext.Provider>
        </UIConfigContext.Provider>
      </QueryClientProvider>
    </BrowserRouter>
  );
});
