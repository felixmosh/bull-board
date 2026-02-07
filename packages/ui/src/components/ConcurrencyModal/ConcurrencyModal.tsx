import type { AppQueue } from '@bull-board/api/typings/app';
import React, { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueues } from '../../hooks/useQueues';
import { Button } from '../Button/Button';
import { InputField } from '../Form/InputField/InputField';
import { Modal } from '../Modal/Modal';

export interface ConcurrencyModalProps {
  open: boolean;
  queue: AppQueue;
  onClose(): void;
}

export const ConcurrencyModal = ({ open, onClose, queue }: ConcurrencyModalProps) => {
  const { actions } = useQueues();
  const { t } = useTranslation();
  const [value, setValue] = useState<string>(
    queue.globalConcurrency != null ? String(queue.globalConcurrency) : ''
  );

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();
    const concurrency = value === '' ? 0 : parseInt(value, 10);
    if (isNaN(concurrency) || concurrency < 0) return;
    await actions.setGlobalConcurrency(queue.name, concurrency)();
    onClose();
  };

  return (
    <Modal
      width="small"
      open={open}
      onClose={onClose}
      title={t('CONCURRENCY.TITLE')}
      actionButton={
        <Button type="submit" theme="primary" form="concurrency-form">
          {t('CONCURRENCY.SAVE')}
        </Button>
      }
    >
      <form id="concurrency-form" onSubmit={handleSubmit}>
        <p>{t('CONCURRENCY.DESCRIPTION')}</p>
        <InputField
          label={t('CONCURRENCY.CONCURRENCY')}
          id="concurrency"
          name="concurrency"
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue((e.target as HTMLInputElement).value)}
        />
      </form>
    </Modal>
  );
};
