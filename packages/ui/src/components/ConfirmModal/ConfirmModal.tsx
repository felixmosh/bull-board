import { AlertDialog } from '@base-ui/react/alert-dialog';
import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import modalStyles from '../Modal/Modal.module.css';
import s from './ConfirmModal.module.css';

export interface ConfirmProps {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmModal = ({ open, onConfirm, title, onCancel, description }: ConfirmProps) => {
  const { t } = useTranslation();
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
          <div className={cn(modalStyles.content, s.content)}>
            {!!title && <AlertDialog.Title>{title}</AlertDialog.Title>}
            {!!description && (
              <AlertDialog.Description className={s.description}>
                {description}
              </AlertDialog.Description>
            )}
            <div className={modalStyles.actions}>
              <AlertDialog.Close
                render={
                  <Button theme="primary" onClick={onConfirm}>
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
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};
