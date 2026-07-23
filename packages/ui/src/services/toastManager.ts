import { Toast } from '@base-ui/react/toast';

// Created outside React so non-component code (Api, action helpers) can raise toasts.
export const toastManager = Toast.createToastManager();

export const TOAST_TIMEOUT = 5000;
