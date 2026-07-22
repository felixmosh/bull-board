import formatBytes from 'pretty-bytes';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import { Loader } from '../../components/Loader/Loader';
import { Modal } from '../../components/Modal/Modal';
import { useConfirm } from '../../hooks/useConfirm';
import { useHistoryUsage, usePurgeHistory } from '../../hooks/useHistoryStorage';
import { useUIConfig } from '../../hooks/useUIConfig';
import s from './HistoryStorageModal.module.css';

interface HistoryStorageModalProps {
  open: boolean;
  /** Start of the range currently charted, used as the "keep only this" cutoff. */
  from: number;
  rangeLabel: string;
  onClose(): void;
}

function toDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const HistoryStorageModal = ({
  open,
  from,
  rangeLabel,
  onClose,
}: HistoryStorageModalProps) => {
  const { t } = useTranslation();
  const { canPurgeHistory } = useUIConfig();
  const { usage, loading, refreshing } = useHistoryUsage(open);
  const purge = usePurgeHistory();
  const { openConfirm } = useConfirm();

  const cutoff = toDay(from);
  const hasTrimmable = usage?.oldestDay != null && usage.oldestDay < cutoff;
  // Purging is followed by a refetch, so the modal stays in a loading state across both
  // rather than briefly showing numbers that the purge has already invalidated.
  const busy = loading || purge.isPending || refreshing;

  async function runPurge(options: { before?: string }, description: string) {
    // Deleting recorded history can't be undone from the board, so every path through
    // here states the scope and the size before it happens.
    try {
      await openConfirm({ title: t('METRICS_HISTORY.STORAGE.CONFIRM_TITLE'), description });
    } catch {
      return;
    }
    await purge.mutateAsync(options);
  }

  return (
    <Modal open={open} onClose={onClose} title={t('METRICS_HISTORY.STORAGE.TITLE')} width="wide">
      {busy ? (
        <Loader />
      ) : !usage || usage.keys === 0 ? (
        <p className={s.empty}>{t('METRICS_HISTORY.STORAGE.EMPTY')}</p>
      ) : (
        <div className={s.body}>
          <dl className={s.summary}>
            <div className={s.summaryItem}>
              <dt>{t('METRICS_HISTORY.STORAGE.TOTAL')}</dt>
              <dd>{formatBytes(usage.bytes)}</dd>
            </div>
            <div className={s.summaryItem}>
              <dt>{t('METRICS_HISTORY.STORAGE.MINUTE_TIER')}</dt>
              <dd>{formatBytes(usage.tiers.minute.bytes)}</dd>
            </div>
            <div className={s.summaryItem}>
              <dt>{t('METRICS_HISTORY.STORAGE.HOUR_TIER')}</dt>
              <dd>{formatBytes(usage.tiers.hour.bytes)}</dd>
            </div>
            <div className={s.summaryItem}>
              <dt>{t('METRICS_HISTORY.STORAGE.DAY_TIER')}</dt>
              <dd>{formatBytes(usage.tiers.day.bytes)}</dd>
            </div>
            {usage.oldestDay && usage.newestDay && (
              <div className={s.summaryItem}>
                <dt>{t('METRICS_HISTORY.STORAGE.RANGE')}</dt>
                <dd>
                  {usage.oldestDay} to {usage.newestDay}
                </dd>
              </div>
            )}
          </dl>

          <p className={s.note}>{t('METRICS_HISTORY.STORAGE.TIER_NOTE')}</p>

          <div className={s.tableWrapper}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>{t('METRICS_HISTORY.QUEUE')}</th>
                  <th className={s.numeric}>{t('METRICS_HISTORY.STORAGE.SIZE')}</th>
                  <th className={s.numeric}>{t('METRICS_HISTORY.STORAGE.MINUTES')}</th>
                </tr>
              </thead>
              <tbody>
                {usage.queues.map((queue) => (
                  <tr key={queue.queue}>
                    <td className={s.queueCell}>{queue.queue}</td>
                    <td className={s.numeric}>{formatBytes(queue.bytes)}</td>
                    <td className={s.numeric}>{queue.minutes.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canPurgeHistory && (
            <div className={s.actions}>
              <Button
                theme="basic"
                disabled={!hasTrimmable}
                onClick={() =>
                  runPurge(
                    { before: cutoff },
                    t('METRICS_HISTORY.STORAGE.CONFIRM_TRIM', { range: rangeLabel, date: cutoff })
                  )
                }
              >
                {t('METRICS_HISTORY.STORAGE.TRIM_BTN', { range: rangeLabel })}
              </Button>
              <Button
                theme="basic"

                onClick={() =>
                  runPurge(
                    {},
                    t('METRICS_HISTORY.STORAGE.CONFIRM_CLEAR', { size: formatBytes(usage.bytes) })
                  )
                }
              >
                {t('METRICS_HISTORY.STORAGE.CLEAR_BTN')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
