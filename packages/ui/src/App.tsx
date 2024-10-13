import React, { Suspense, useEffect } from 'react';
import { Route, Switch } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { ConfirmModal } from './components/ConfirmModal/ConfirmModal';
import { Header } from './components/Header/Header';
import { HeaderActions } from './components/HeaderActions/HeaderActions';
import { Loader } from './components/Loader/Loader';
import { Menu } from './components/Menu/Menu';
import { Title } from './components/Title/Title';
import { useConfirm } from './hooks/useConfirm';
import { useQueues } from './hooks/useQueues';
import { useScrollTopOnNav } from './hooks/useScrollTopOnNav';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from './hooks/useSettings';
import { ThemeProvider } from 'next-themes';

const JobPageLazy = React.lazy(() =>
  import('./pages/JobPage/JobPage').then(({ JobPage }) => ({ default: JobPage }))
);

const QueuePageLazy = React.lazy(() =>
  import('./pages/QueuePage/QueuePage').then(({ QueuePage }) => ({ default: QueuePage }))
);

const OverviewPageLazy = React.lazy(() =>
  import('./pages/OverviewPage/OverviewPage').then(({ OverviewPage }) => ({
    default: OverviewPage,
  }))
);

export const App = () => {
  useScrollTopOnNav();
  const { actions: queueActions } = useQueues();
  const { confirmProps } = useConfirm();

  useEffect(() => {
    queueActions.updateQueues();
  }, []);

  const { i18n } = useTranslation();
  const { language } = useSettingsStore();
  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  return (
    <ThemeProvider>
      <Header>
        <Title />
        <HeaderActions />
      </Header>
      <main>
        <div>
          <Suspense fallback={<Loader />}>
            <Switch>
              <Route path="/queue/:name/:jobId" render={() => <JobPageLazy />} />
              <Route path="/queue/:name" render={() => <QueuePageLazy />} />

              <Route path="/" exact render={() => <OverviewPageLazy />} />
            </Switch>
          </Suspense>
          <ConfirmModal {...confirmProps} />
        </div>
      </main>
      <Menu />
      <ToastContainer />
    </ThemeProvider>
  );
};
