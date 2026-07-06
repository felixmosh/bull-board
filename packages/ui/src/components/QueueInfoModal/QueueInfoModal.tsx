import type { AppQueue } from '@bull-board/api/typings/app';
import cn from 'clsx';
import { PropsWithChildren, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueueDefaultJobOptions } from '../../hooks/useQueueDefaultJobOptions';
import { CollapsibleSection } from '../CollapsibleSection/CollapsibleSection';
import { Modal } from '../Modal/Modal';
import s from './QueueInfoModal.module.css';

export interface QueueInfoModalProps {
  open: boolean;
  queue: AppQueue;
  onClose(): void;
}

const Row = ({ label, children }: PropsWithChildren<{ label: string }>) => (
  <div className={s.row}>
    <dt className={s.label}>{label}</dt>
    <dd className={s.value}>{children}</dd>
  </div>
);

function toStartCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatOptionValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('type' in obj || 'delay' in obj) {
      const parts: string[] = [];
      if (obj.type) parts.push(String(obj.type));
      if (obj.delay != null) parts.push(`${obj.delay}ms`);
      if (parts.length) return parts.join(' · ');
    }
    return JSON.stringify(obj);
  }
  return String(value);
}

type InfoSection = 'overview' | 'defaults' | 'description';

export const QueueInfoModal = ({ open, queue, onClose }: QueueInfoModalProps) => {
  const { t } = useTranslation();
  const [openSection, setOpenSection] = useState<InfoSection | ''>('overview');
  const toggleSection = (section: InfoSection) =>
    setOpenSection((current) => (current === section ? '' : section));

  const totalJobs = queue.statuses.reduce((sum, status) => sum + (queue.counts[status] || 0), 0);
  const { defaultJobOptions } = useQueueDefaultJobOptions(queue.name, open);
  const optionEntries = Object.entries(defaultJobOptions || {});

  return (
    <Modal width="medium" open={open} onClose={onClose} title={t('QUEUE.INFO.TITLE')}>
      <div className={s.queueName} title={queue.name}>
        {queue.displayName || queue.name}
      </div>

      <CollapsibleSection
        title={t('QUEUE.INFO.OVERVIEW')}
        open={openSection === 'overview'}
        onToggle={() => toggleSection('overview')}
      >
        <dl className={s.grid}>
          <Row label={t('QUEUE.INFO.NAME')}>
            <span className={s.mono}>{queue.name}</span>
          </Row>
          {queue.displayName && queue.displayName !== queue.name && (
            <Row label={t('QUEUE.INFO.DISPLAY_NAME')}>{queue.displayName}</Row>
          )}
          <Row label={t('QUEUE.INFO.TYPE')}>
            <span className={s.badge}>{queue.type === 'bullmq' ? 'BullMQ' : 'Bull'}</span>
          </Row>
          <Row label={t('QUEUE.INFO.STATE')}>
            <span className={cn(s.badge, queue.isPaused ? s.badgePaused : s.badgeRunning)}>
              {queue.isPaused ? t('QUEUE.INFO.PAUSED') : t('QUEUE.INFO.RUNNING')}
            </span>
          </Row>
          <Row label={t('QUEUE.INFO.GLOBAL_CONCURRENCY')}>
            {queue.globalConcurrency != null ? (
              <span className={s.mono}>{queue.globalConcurrency}</span>
            ) : (
              <span className={s.muted}>{t('QUEUE.INFO.NOT_SET')}</span>
            )}
          </Row>
          <Row label={t('QUEUE.INFO.READ_ONLY')}>
            {queue.readOnlyMode ? t('QUEUE.INFO.YES') : t('QUEUE.INFO.NO')}
          </Row>
          <Row label={t('QUEUE.INFO.RETRIES')}>
            {queue.allowRetries ? t('QUEUE.INFO.YES') : t('QUEUE.INFO.NO')}
          </Row>
          <Row label={t('QUEUE.INFO.DELIMITER')}>
            {queue.delimiter ? (
              <span className={s.mono}>{queue.delimiter}</span>
            ) : (
              <span className={s.muted}>—</span>
            )}
          </Row>
          <Row label={t('QUEUE.INFO.TOTAL_JOBS')}>
            <span className={s.mono}>{totalJobs}</span>
          </Row>
        </dl>
      </CollapsibleSection>

      {optionEntries.length > 0 && (
        <CollapsibleSection
          title={t('QUEUE.INFO.DEFAULTS')}
          open={openSection === 'defaults'}
          onToggle={() => toggleSection('defaults')}
        >
          <dl className={s.grid}>
            {optionEntries.map(([key, value]) => (
              <Row key={key} label={toStartCase(key)}>
                <span className={s.mono}>{formatOptionValue(value)}</span>
              </Row>
            ))}
          </dl>
        </CollapsibleSection>
      )}

      {!!queue.description && (
        <CollapsibleSection
          title={t('QUEUE.INFO.DESCRIPTION')}
          open={openSection === 'description'}
          onToggle={() => toggleSection('description')}
        >
          <p className={s.description}>{queue.description}</p>
        </CollapsibleSection>
      )}
    </Modal>
  );
};
