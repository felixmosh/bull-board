import {
  Action,
  Cancel,
  Content,
  Description,
  Overlay,
  Root,
  Title,
} from '@radix-ui/react-alert-dialog';
import React from 'react';
import s from './ConfirmModal.module.css';
import { Button } from '../JobCard/Button/Button';

export interface ConfirmProps {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal = (props: ConfirmProps) => {
  const closeOnOpenChange = (open: boolean) => {
    if (!open) {
      props.onCancel();
    }
  };

  return (
    <Root open={props.open} onOpenChange={closeOnOpenChange}>
      <Overlay className={s.overlay} />
      <Content className={s.contentWrapper}>
        <div className={s.content}>
          {!!props.title && (
            <Title asChild>
              <h3>{props.title}</h3>
            </Title>
          )}
          {!!props.description && <Description>{props.description}</Description>}
          <div className={s.actions}>
            <Action asChild>
              <Button theme="primary" onClick={props.onConfirm}>
                Confirm
              </Button>
            </Action>
            <Cancel asChild>
              <Button theme="basic" onClick={props.onCancel}>
                Cancel
              </Button>
            </Cancel>
          </div>
        </div>
      </Content>
    </Root>
  );
};
