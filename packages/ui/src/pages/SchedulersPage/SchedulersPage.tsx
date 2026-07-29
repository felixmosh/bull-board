import type { AppJobScheduler, AppQueue } from '@bull-board/api/typings/app';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useHistory, useLocation } from 'react-router-dom';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';
import { CollapsibleJSON } from '../../components/CollapsibleJSON/CollapsibleJSON';
import { SelectField } from '../../components/Form/SelectField/SelectField';
import { ChevronDown } from '../../components/Icons/ChevronDown';
import { TrashIcon } from '../../components/Icons/Trash';
import { UpdateIcon } from '../../components/Icons/UpdateIcon';
import { Loader } from '../../components/Loader/Loader';
import { useJobSchedulers } from '../../hooks/useJobSchedulers';
import { useQueues } from '../../hooks/useQueues';
import { useUIConfig } from '../../hooks/useUIConfig';
import { formatDate, formatRelativeToNow } from '../../utils/formatDate';
import { links } from '../../utils/links';
import { describeSchedule } from './schedule';
import { SchedulerEditModal } from './SchedulerEditModal';
import s from './SchedulersPage.module.css';

const ALL_QUEUES = '';

export const SchedulersPage = () => {
  const { t, i18n } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const uiConfig = useUIConfig();

  const queueFilter = new URLSearchParams(location.search).get('queueName') || ALL_QUEUES;

  const { schedulers, loading, actions } = useJobSchedulers(queueFilter || undefined);
  const { queues } = useQueues();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [editing, setEditing] = useState<AppJobScheduler | null>(null);

  const queuesByName = new Map<string, AppQueue>(
    (queues ?? []).map((queue) => [queue.name, queue])
  );

  const rowKey = (scheduler: AppJobScheduler) => `${scheduler.queueName}:${scheduler.id}`;

  const toggleRow = (scheduler: AppJobScheduler) => {
    const key = rowKey(scheduler);
    setExpanded((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));
  };

  const setQueueFilter = (queueName: string) => {
    const search = queueName ? `?queueName=${encodeURIComponent(queueName)}` : '';
    history.push(`/job-schedulers${search}`);
  };

  /**
   * The time itself becomes the link when the run it describes is a job that still exists, so a
   * run the queue has already trimmed away reads as plain text rather than a dead link.
   */
  const renderTime = (scheduler: AppJobScheduler, ts?: number, jobId?: string) => {
    if (!ts) {
      return <span className={s.muted}>-</span>;
    }

    const time = (
      <time dateTime={new Date(ts).toISOString()}>
        {formatDate(ts, i18n.language, uiConfig.dateFormats)}
      </time>
    );

    return (
      <>
        {jobId ? <Link to={links.jobPage(scheduler.queueName, jobId)}>{time}</Link> : time}
        <small className={s.relative}>{formatRelativeToNow(ts, i18n.language)}</small>
      </>
    );
  };

  return (
    <section className={s.page}>
      <Card className={s.card}>
        <div className={s.header}>
          <h2 className={s.title}>{t('SCHEDULERS.TITLE')}</h2>
          <SelectField
            id="scheduler-queue-filter"
            aria-label={t('SCHEDULERS.FILTER_BY_QUEUE')}
            value={queueFilter}
            onChange={(e) => setQueueFilter((e.target as HTMLSelectElement).value)}
            options={[
              { value: ALL_QUEUES, text: t('SCHEDULERS.ALL_QUEUES') },
              ...(queues ?? []).map((queue) => ({
                value: queue.name,
                text: queue.displayName || queue.name,
              })),
            ]}
          />
        </div>

        {loading ? (
          <Loader />
        ) : schedulers.length === 0 ? (
          <p className={s.empty}>{t('SCHEDULERS.EMPTY')}</p>
        ) : (
          <div className={s.tableWrapper}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th />
                  <th>{t('SCHEDULERS.COLUMNS.SCHEDULER')}</th>
                  <th>{t('SCHEDULERS.COLUMNS.QUEUE')}</th>
                  <th>{t('SCHEDULERS.COLUMNS.SCHEDULE')}</th>
                  <th>{t('SCHEDULERS.COLUMNS.NEXT_RUN')}</th>
                  <th>{t('SCHEDULERS.COLUMNS.LAST_RUN')}</th>
                  <th>{t('SCHEDULERS.COLUMNS.RUNS')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {schedulers.map((scheduler) => {
                  const queue = queuesByName.get(scheduler.queueName);
                  const isReadOnly = queue?.readOnlyMode ?? false;
                  // Bull has no upsert for repeatable jobs, so its schedules are read-only here.
                  // An unknown queue is treated the same way until the queues list arrives.
                  const canEdit = !isReadOnly && queue?.type === 'bullmq';
                  const isExpanded = expanded.includes(rowKey(scheduler));
                  const hasTemplate = !!scheduler.template?.data || !!scheduler.template?.opts;

                  return (
                    <Fragment key={rowKey(scheduler)}>
                      <tr>
                        <td className={s.expandCell}>
                          {hasTemplate && (
                            <button
                              type="button"
                              className={s.expandBtn}
                              aria-expanded={isExpanded}
                              aria-label={t('SCHEDULERS.TEMPLATE')}
                              onClick={() => toggleRow(scheduler)}
                            >
                              <ChevronDown className={isExpanded ? s.chevronOpen : undefined} />
                            </button>
                          )}
                        </td>
                        <td>
                          <span className={s.schedulerId}>{scheduler.id}</span>
                          <small className={s.jobName}>{scheduler.name}</small>
                        </td>
                        <td>
                          <Link to={`/queue/${encodeURIComponent(scheduler.queueName)}`}>
                            {queue?.displayName || scheduler.queueName}
                          </Link>
                        </td>
                        <td>
                          <code className={s.schedule}>{describeSchedule(scheduler, t)}</code>
                          {!!scheduler.tz && <small className={s.tz}>{scheduler.tz}</small>}
                        </td>
                        <td>{renderTime(scheduler, scheduler.next, scheduler.nextRunJobId)}</td>
                        <td>{renderTime(scheduler, scheduler.lastRun, scheduler.lastRunJobId)}</td>
                        <td>
                          {scheduler.iterationCount ?? <span className={s.muted}>-</span>}
                          {!!scheduler.limit && (
                            <small className={s.limit}>
                              {t('SCHEDULERS.OF_LIMIT', { limit: scheduler.limit })}
                            </small>
                          )}
                        </td>
                        <td className={s.actionsCell}>
                          {canEdit && (
                            <Button
                              compact
                              onClick={() => setEditing(scheduler)}
                              title={t('SCHEDULERS.ACTIONS.EDIT')}
                              aria-label={t('SCHEDULERS.ACTIONS.EDIT')}
                            >
                              <UpdateIcon />
                            </Button>
                          )}
                          {!isReadOnly && (
                            <Button
                              compact
                              onClick={actions.remove(scheduler)}
                              title={t('SCHEDULERS.ACTIONS.REMOVE')}
                              aria-label={t('SCHEDULERS.ACTIONS.REMOVE')}
                            >
                              <TrashIcon />
                            </Button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className={s.templateRow}>
                          <td />
                          <td colSpan={7}>
                            <CollapsibleJSON data={scheduler.template} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!!editing && (
        <SchedulerEditModal
          open={true}
          scheduler={editing}
          onClose={() => setEditing(null)}
          onSubmit={(repeat) => actions.update(editing, repeat)}
        />
      )}
    </section>
  );
};
