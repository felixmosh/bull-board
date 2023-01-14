import {
  Action,
  Cancel,
  Content,
  Description,
  Overlay,
  Root,
  Title,
  Portal,
} from '@radix-ui/react-alert-dialog';
import React from 'react';
import s from './ConfirmModal.module.css';
import modalStyles from '../Modal/Modal.module.css';
import { Button } from '../JobCard/Button/Button';
import { useSettingsStore } from '../../hooks/useSettings';
import classNames from 'classnames/bind';

const cx = classNames.bind(s, modalStyles);

export interface ConfirmProps {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal = ({ open, onConfirm, title, onCancel, description }: ConfirmProps) => {
  const { darkMode } = useSettingsStore();
  const closeOnOpenChange = (open: boolean) => {
    if (!open) {
      onCancel();
    }
  };

  return (
    <Root open={open} onOpenChange={closeOnOpenChange}>
      <Portal>
        <Overlay className={modalStyles.overlay} />
        <Content className={modalStyles.contentWrapper}>
          <div className={cx(modalStyles.content, s.content, { dark: darkMode })}>
            {!!title && (
              <Title asChild>
                <h3>{title}</h3>
              </Title>
            )}
            {!!description && <Description>{description}</Description>}
            <div className={cx(modalStyles.actions, {dark: darkMode})}>
              <Action asChild>
                <Button theme="primary" onClick={onConfirm}>
                  Confirm
                </Button>
              </Action>
              <Cancel asChild>
                <Button theme="basicDark"  onClick={onCancel}>
                  Cancel
                </Button>
              </Cancel>
            </div>
          </div>
        </Content>
      </Portal>
    </Root>
  );
};
