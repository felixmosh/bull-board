import type { AppQueue } from '@bull-board/api/typings/app';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueueRateLimit } from '../../hooks/useQueueRateLimit';
import { useQueues } from '../../hooks/useQueues';
import { Button } from '../Button/Button';
import { InputField } from '../Form/InputField/InputField';
import { RateLimitIcon } from '../Icons/RateLimit';
import { Modal } from '../Modal/Modal';
import s from './RateLimitModal.module.css';

export interface RateLimitModalProps {
  open: boolean;
  queue: AppQueue;
  onClose(): void;
}

export const RateLimitModal = ({ open, onClose, queue }: RateLimitModalProps) => {
  const { actions } = useQueues();
  const { t } = useTranslation();
  const { rateLimit, loading } = useQueueRateLimit(queue.name, open);

  const [max, setMax] = useState('');
  const [duration, setDuration] = useState('');

  useEffect(() => {
    setMax(rateLimit ? String(rateLimit.max) : '');
    setDuration(rateLimit ? String(rateLimit.duration) : '');
  }, [rateLimit, open]);

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();

    if (max === '' && duration === '') {
      await actions.setQueueRateLimit(queue.name, null)();
      onClose();
      return;
    }

    const parsedMax = parseInt(max, 10);
    const parsedDuration = parseInt(duration, 10);

    if (!Number.isInteger(parsedMax) || !Number.isInteger(parsedDuration)) return;
    if (parsedMax <= 0 || parsedDuration <= 0) return;

    await actions.setQueueRateLimit(queue.name, {
      max: parsedMax,
      duration: parsedDuration,
    })();
    onClose();
  };

  return (
    <Modal
      width="small"
      open={open}
      onClose={onClose}
      title={t('RATE_LIMIT.TITLE')}
      actionButton={
        <Button type="submit" theme="primary" form="rate-limit-form" disabled={loading}>
          {t('RATE_LIMIT.SAVE')}
        </Button>
      }
    >
      <form id="rate-limit-form" onSubmit={handleSubmit}>
        <p className={s.intro}>{t('RATE_LIMIT.DESCRIPTION')}</p>

        {queue.activeRateLimitTtl > 0 && (
          <div className={s.active}>
            <RateLimitIcon />
            <span className={s.activeText}>
              {t('RATE_LIMIT.ACTIVE_FOR', {
                seconds: Math.ceil(queue.activeRateLimitTtl / 1000),
              })}
            </span>
            <Button
              type="button"
              compact
              theme="basic"
              onClick={async () => {
                await actions.releaseQueueRateLimit(queue.name)();
                onClose();
              }}
            >
              {t('RATE_LIMIT.RELEASE')}
            </Button>
          </div>
        )}

        <div className={s.fields}>
          <div>
            <InputField
              label={t('RATE_LIMIT.MAX')}
              id="rate-limit-max"
              name="max"
              type="number"
              autoFocus
              min={1}
              value={max}
              onChange={(e) => setMax((e.target as HTMLInputElement).value)}
            />
          </div>
          <div>
            <InputField
              label={t('RATE_LIMIT.DURATION')}
              id="rate-limit-duration"
              name="duration"
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};
