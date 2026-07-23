import { Toast } from '@base-ui/react/toast';
import { useTranslation } from 'react-i18next';
import { TOAST_TIMEOUT, toastManager } from '../../services/toastManager';
import { CheckIcon } from '../Icons/Check';
import { CloseIcon } from '../Icons/Close';
import { InfoIcon } from '../Icons/Info';
import s from './Toaster.module.css';

const ToastIcon = ({ type }: { type?: string }) => {
  if (type === 'loading') {
    return <span className={s.spinner} />;
  }

  return type === 'success' ? <CheckIcon /> : <InfoIcon />;
};

const ToastList = () => {
  const { t } = useTranslation();
  const { toasts } = Toast.useToastManager();

  return toasts.map((toast) => (
    <Toast.Root key={toast.id} toast={toast} className={s.toast} data-type={toast.type}>
      <span className={s.icon}>
        <ToastIcon type={toast.type} />
      </span>
      <Toast.Title className={s.title} />
      <Toast.Description className={s.description} />
      <Toast.Close className={s.close} aria-label={t('MODAL.CLOSE_BTN')}>
        <CloseIcon />
      </Toast.Close>
    </Toast.Root>
  ));
};

export const Toaster = () => (
  <Toast.Provider toastManager={toastManager} timeout={TOAST_TIMEOUT}>
    <Toast.Portal>
      <Toast.Viewport className={s.viewport}>
        <ToastList />
      </Toast.Viewport>
    </Toast.Portal>
  </Toast.Provider>
);
