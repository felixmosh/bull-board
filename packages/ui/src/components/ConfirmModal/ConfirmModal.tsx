import { AlertDialog } from '@base-ui/react/alert-dialog';
import cn from 'clsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import { CheckboxField } from '../Form/CheckboxField/CheckboxField';
import modalStyles from '../Modal/Modal.module.css';
import s from './ConfirmModal.module.css';

/** An extra opt-in the confirm can ask for, e.g. forcing an obliterate past its active jobs. */
export interface ConfirmCheckbox {
  label: string;
  description?: string;
  defaultChecked?: boolean;
}

export interface ConfirmResult {
  /** State of the confirm's checkbox, `false` whenever it did not render one. */
  checked: boolean;
}

export interface ConfirmProps {
  open: boolean;
  title: string;
  description: string;
  checkbox?: ConfirmCheckbox;
  onCancel: () => void;
  /** Omitting the result is the same as confirming with the checkbox left unchecked. */
  onConfirm: (result?: ConfirmResult) => void;
}

export const ConfirmModal = ({
  open,
  onConfirm,
  title,
  onCancel,
  description,
  checkbox,
}: ConfirmProps) => {
  const closeOnOpenChange = (open: boolean) => {
    if (!open) {
      onCancel();
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={closeOnOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={cn(modalStyles.overlay, s.overlay)} />
        <AlertDialog.Popup className={cn(modalStyles.contentWrapper, s.contentWrapper)}>
          {/*
           * The body lives in its own component so that the checkbox state is created fresh on
           * every open: the popup's subtree unmounts on close, which is what resets a checkbox
           * someone ticked and then cancelled.
           */}
          <ConfirmContent
            title={title}
            description={description}
            checkbox={checkbox}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};

const ConfirmContent = ({
  title,
  description,
  checkbox,
  onConfirm,
  onCancel,
}: Omit<ConfirmProps, 'open'>) => {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(checkbox?.defaultChecked ?? false);

  return (
    <div className={cn(modalStyles.content, s.content)}>
      {!!title && <AlertDialog.Title>{title}</AlertDialog.Title>}
      {!!description && (
        <AlertDialog.Description className={s.description}>{description}</AlertDialog.Description>
      )}
      {!!checkbox && (
        <div className={s.checkbox}>
          <CheckboxField
            id="confirm-checkbox"
            label={checkbox.label}
            description={checkbox.description}
            checked={checked}
            onCheckedChange={setChecked}
          />
        </div>
      )}
      <div className={modalStyles.actions}>
        <AlertDialog.Close
          render={
            <Button theme="primary" onClick={() => onConfirm({ checked })}>
              {t('CONFIRM.CONFIRM_BTN')}
            </Button>
          }
        />
        <AlertDialog.Close
          render={
            <Button theme="basic" onClick={onCancel}>
              {t('CONFIRM.CANCEL_BTN')}
            </Button>
          }
        />
      </div>
    </div>
  );
};
