import * as Dialog from '@radix-ui/react-dialog';
import React, { PropsWithChildren } from 'react';
import { Button } from '../JobCard/Button/Button';
import s from './Modal.module.css';
import { useSettingsStore } from '../../hooks/useSettings';
import classNames from 'classnames/bind';

const cx = classNames.bind(s);

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
  const { darkMode } = useSettingsStore()
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
          <div className={cx(s.content, s[width || ''], { dark: darkMode })}>
            {!!title && <Dialog.Title>{title}</Dialog.Title>}
            <Dialog.Description asChild>
              <div className={s.description}>{children}</div>
            </Dialog.Description>
            <div className={cx(s.actions, {dark: darkMode})}>
              {actionButton}
              <Dialog.Close asChild>
                <Button theme="basicDark">Close</Button>
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
