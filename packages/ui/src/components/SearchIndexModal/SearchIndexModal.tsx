import type { GetSearchStatusResponse } from '@bull-board/api/typings/responses';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSearchCoverage } from '../../hooks/useJobSearch';
import { useUIConfig } from '../../hooks/useUIConfig';
import { formatDate, formatRelativeToNow } from '../../utils/formatDate';
import { links } from '../../utils/links';
import { Button } from '../Button/Button';
import { Modal } from '../Modal/Modal';
import { HEALTH_KEYS } from '../SearchIndexStatus/healthKeys';
import s from './SearchIndexModal.module.css';

interface SearchIndexModalProps {
  open: boolean;
  queueName: string;
  fields: string[];
  totalJobs: number;
  status: GetSearchStatusResponse;
  canCheckCoverage: boolean;
  onClose(): void;
}

function formatSeconds(durationMs: number, language: string): string {
  const subSecond = durationMs < 1000;
  const seconds = subSecond
    ? Math.max(Math.round(durationMs / 100), durationMs > 0 ? 1 : 0) / 10
    : Math.round(durationMs / 1000);
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: subSecond ? 1 : 0,
    maximumFractionDigits: subSecond ? 1 : 0,
  }).format(seconds);
}

export const SearchIndexModal = ({
  open,
  onClose,
  queueName,
  fields,
  totalJobs,
  status,
  canCheckCoverage,
}: SearchIndexModalProps) => {
  const { t, i18n } = useTranslation();
  const { dateFormats } = useUIConfig();
  const coverage = useSearchCoverage(queueName);

  const when = (ts: number) => (
    <time dateTime={new Date(ts).toISOString()} title={formatDate(ts, i18n.language, dateFormats)}>
      {formatRelativeToNow(ts, i18n.language)}
    </time>
  );

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: t('QUEUE.SEARCH.INDEX.FIELDS'),
      value: (
        <span className={s.fields}>
          {fields.map((field) => (
            <code key={field}>{field}</code>
          ))}
        </span>
      ),
    },
    {
      label: t('QUEUE.SEARCH.INDEX.HEALTH'),
      value: (
        <>
          {t(HEALTH_KEYS[status.health])}
          {status.reasons.length > 0 && (
            <ul className={s.reasons}>
              {status.reasons.map((reason) => (
                <li key={reason}>{t(`QUEUE.SEARCH.INDEX.REASON.${reason}`)}</li>
              ))}
            </ul>
          )}
        </>
      ),
    },
    ...(status.indexerLastSeenAt !== undefined
      ? [
          {
            label: t('QUEUE.SEARCH.INDEX.INDEXER_LAST_SEEN'),
            value: when(status.indexerLastSeenAt),
          },
        ]
      : []),
    ...(status.lastEventAt !== undefined
      ? [{ label: t('QUEUE.SEARCH.INDEX.LAST_EVENT'), value: when(status.lastEventAt) }]
      : []),
    ...(status.indexedJobs !== undefined
      ? [
          {
            label: t('QUEUE.SEARCH.INDEX.INDEXED_JOBS'),
            value: t('QUEUE.SEARCH.INDEX.INDEXED_OF_TOTAL', {
              indexed: status.indexedJobs,
              total: totalJobs,
            }),
          },
        ]
      : []),
    ...(status.pendingRetries !== undefined
      ? [{ label: t('QUEUE.SEARCH.INDEX.PENDING_RETRIES'), value: status.pendingRetries }]
      : []),
    ...(status.lastBackfill
      ? [
          {
            label: t('QUEUE.SEARCH.INDEX.LAST_BACKFILL'),
            value: (
              <>
                {when(status.lastBackfill.finishedAt)}
                <small className={s.detail}>
                  {t('QUEUE.SEARCH.INDEX.BACKFILL_DETAIL', {
                    count: status.lastBackfill.jobs,
                    seconds: formatSeconds(status.lastBackfill.durationMs, i18n.language),
                  })}
                </small>
              </>
            ),
          },
        ]
      : []),
    ...(status.lastSweep
      ? [
          {
            label: t('QUEUE.SEARCH.INDEX.LAST_SWEEP'),
            value: (
              <>
                {when(status.lastSweep.finishedAt)}
                <small className={s.detail}>
                  {t('QUEUE.SEARCH.INDEX.SWEEP_DETAIL', {
                    checked: t('QUEUE.SEARCH.INDEX.SWEEP_CHECKED', {
                      count: status.lastSweep.checked,
                    }),
                    removed: t('QUEUE.SEARCH.INDEX.SWEEP_REMOVED', {
                      count: status.lastSweep.removed,
                    }),
                  })}
                </small>
              </>
            ),
          },
        ]
      : []),
  ];

  return (
    <Modal width="small" open={open} onClose={onClose} title={t('QUEUE.SEARCH.INDEX.TITLE')}>
      <ul className={s.rows}>
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <span>{row.value}</span>
          </li>
        ))}
      </ul>
      {canCheckCoverage && (
        <div className={s.coverage}>
          <Button
            className={s.coverageButton}
            disabled={coverage.isPending}
            onClick={() => coverage.mutate()}
          >
            {t('QUEUE.SEARCH.INDEX.CHECK_COVERAGE')}
          </Button>
          {coverage.data && (
            <div aria-live="polite">
              <p className={s.coverageResult}>
                {t('QUEUE.SEARCH.INDEX.COVERAGE_RESULT', {
                  checked: coverage.data.checked,
                  missing: coverage.data.missing.length,
                })}
              </p>
              {coverage.data.missing.length > 0 && (
                <>
                  <p className={s.coverageLabel}>{t('QUEUE.SEARCH.INDEX.COVERAGE_MISSING')}</p>
                  <ul className={s.missing}>
                    {coverage.data.missing.map((jobId) => (
                      <li key={jobId}>
                        <Link to={links.jobPage(queueName, jobId)} onClick={onClose}>
                          {jobId}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
