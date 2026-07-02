import React, { Suspense, useEffect } from 'react';
import { Route, Switch } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { ConfirmModal } from './components/ConfirmModal/ConfirmModal';
import { Header } from './components/Header/Header';
import { HeaderActions } from './components/HeaderActions/HeaderActions';
import { Loader } from './components/Loader/Loader';
import { Menu } from './components/Menu/Menu';
import { SidebarToggle } from './components/SidebarToggle/SidebarToggle';
import { Title } from './components/Title/Title';
import { useConfirm } from './hooks/useConfirm';
import { useDarkMode } from './hooks/useDarkMode';
import { useLanguageWatch } from './hooks/useLanguageWatch';
import { useMobileQuery } from './hooks/useMobileQuery';
import { useScrollTopOnNav } from './hooks/useScrollTopOnNav';
import { useSearchHotkey } from './hooks/useSearchHotkey';
import { useSettingsStore } from './hooks/useSettings';

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
  const { confirmProps } = useConfirm();
  const isMobile = useMobileQuery();
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  useLanguageWatch();
  useDarkMode();
  useSearchHotkey();

  useEffect(() => {
    document.body.dataset.sidebarCollapsed = String(!isMobile && sidebarCollapsed);
    requestAnimationFrame(() => document.body.classList.remove('preload'));
    return () => {
      delete document.body.dataset.sidebarCollapsed;
    };
  }, [isMobile, sidebarCollapsed]);

  return (
    <>
      <Header>
        <div className="header-title-group">
          {!isMobile && <SidebarToggle />}
          <Title />
        </div>
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
