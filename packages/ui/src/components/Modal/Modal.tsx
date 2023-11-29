import * as Dialog from '@radix-ui/react-dialog';
import cn from 'clsx';
import React, { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import s from './Modal.module.css';

interface ModalProps {
  open: boolean;
  title?: string;
  width?: 'small' | 'medium' | 'wide';
  actionButton?: React.ReactNode;
  onClose(): void;
}

export const Modal = ({
  open,
  title,
  onClose,
  children,
  width,
  actionButton,
}: PropsWithChildren<ModalProps>) => {
  const { t } = useTranslation();
  const closeOnOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog.Root open={open} modal={true} onOpenChange={closeOnOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={s.contentWrapper}>
          <div className={cn(s.content, s[width || ''])}>
            {!!title && <Dialog.Title>{title}</Dialog.Title>}
            <Dialog.Description asChild>
              <div className={s.description}>{children}</div>
            </Dialog.Description>
            <div className={s.actions}>
              {actionButton}
              <Dialog.Close asChild>
                <Button theme="basic">{t('MODAL.CLOSE_BTN')}</Button>
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
