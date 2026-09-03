import type { FlowNode } from '@bull-board/api/typings/app';
import { useQuery } from '@tanstack/react-query';
import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { queryKeys } from '../../hooks/queryKeys';
import { useApi } from '../../hooks/useApi';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { useSettingsStore } from '../../hooks/useSettings';
import { links } from '../../utils/links';
import { CollapsibleJSON } from '../CollapsibleJSON/CollapsibleJSON';
import { stateClassName } from './flowStates';
import styles from './FlowGraph.module.css';

export interface FlowDetailsPanelProps {
  node: FlowNode;
}

export const FlowDetailsPanel = ({ node }: FlowDetailsPanelProps) => {
  const { t } = useTranslation();
  const api = useApi();
  const selectedStatuses = useSelectedStatuses();
  const defaultCollapseDepth = useSettingsStore((state) => state.defaultCollapseDepth);

  const { data, isPending } = useQuery({
    queryKey: queryKeys.job(node.queueName, node.id),
    queryFn: () => api.getJob(node.queueName, node.id),
  });

  const deps = node.dependencies;
  const job = data?.job;

  return (
    <aside className={styles.panel}>
      <header className={styles.panelHeader}>
        <div className={styles.panelTitleRow}>
          <h5 className={styles.panelTitle}>{node.name ?? node.id}</h5>
          <span className={cn(styles.panelBadge, stateClassName(node.state))}>{node.state}</span>
        </div>
        <span className={styles.panelQueue}>{node.queueName}</span>
      </header>

      <dl className={styles.panelFacts}>
        <dt>{t('JOB.FLOW.PANEL_ID')}</dt>
        <dd className={styles.panelId}>{node.id}</dd>
        {!!deps && (
          <>
            <dt>{t('JOB.FLOW.PANEL_CHILDREN')}</dt>
            <dd className={styles.panelDeps}>
              {deps.processed > 0 && <span>{t('JOB.FLOW.PROCESSED', { n: deps.processed })}</span>}
              {deps.unprocessed > 0 && (
                <span>{t('JOB.FLOW.UNPROCESSED', { n: deps.unprocessed })}</span>
              )}
              {deps.failed > 0 && (
                <span className={styles.depFailed}>{t('JOB.FLOW.FAILED', { n: deps.failed })}</span>
              )}
              {deps.ignored > 0 && (
                <span className={styles.depIgnored}>
                  {t('JOB.FLOW.IGNORED', { n: deps.ignored })}
                </span>
              )}
            </dd>
          </>
        )}
        {!!job?.attempts && (
          <>
            <dt>{t('JOB.FLOW.PANEL_ATTEMPTS')}</dt>
            <dd>{job.attempts}</dd>
          </>
        )}
      </dl>

      {!!job?.failedReason && (
        <section className={styles.panelSection}>
          <h6 className={styles.panelSectionTitle}>{t('JOB.FLOW.PANEL_ERROR')}</h6>
          <p className={styles.panelError}>{job.failedReason}</p>
        </section>
      )}

      <section className={styles.panelSection}>
        <h6 className={styles.panelSectionTitle}>{t('JOB.FLOW.PANEL_DATA')}</h6>
        <div className={styles.panelData}>
          {isPending && <p className={styles.panelEmpty}>{t('JOB.FLOW.PANEL_DATA_LOADING')}</p>}
          {!isPending && !job && (
            <p className={styles.panelEmpty}>{t('JOB.FLOW.PANEL_DATA_MISSING')}</p>
          )}
          {!!job && <CollapsibleJSON data={job.data} defaultCollapseDepth={defaultCollapseDepth} />}
        </div>
      </section>

      <Link
        className={styles.panelLink}
        to={links.jobPage(node.queueName, node.id, selectedStatuses)}
      >
        {t('JOB.FLOW.OPEN_JOB')}
      </Link>
    </aside>
  );
};
