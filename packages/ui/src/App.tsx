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
import { useDarkMode } from './hooks/useDarkMode';
import { useLanguageWatch } from './hooks/useLanguageWatch';
import { useMobileQuery } from './hooks/useMobileQuery';
import { useQueues } from './hooks/useQueues';
import { useScrollTopOnNav } from './hooks/useScrollTopOnNav';

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
  const isMobile = useMobileQuery();
  useLanguageWatch();
  useDarkMode();

  useEffect(() => {
    queueActions.updateQueues();
  }, []);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    const style = document.createElement('style');
    style.textContent = `
      * { outline: 1px solid rgba(255, 0, 0, 0.15) !important; }
      *:hover { outline-color: rgba(255, 0, 0, 0.6) !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <>
      <Header>
        <Title />
        <HeaderActions />
      </Header>
      {!isMobile && <Menu />}
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
      <ToastContainer />
    </>
  );
};
