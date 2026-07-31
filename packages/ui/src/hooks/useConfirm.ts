import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import {
  ConfirmCheckbox,
  ConfirmProps,
  ConfirmResult,
} from '../components/ConfirmModal/ConfirmModal';

interface ConfirmState {
  promise: { resolve: (value: ConfirmResult) => void; reject: () => void } | null;
  opts: { title?: string; description?: string; checkbox?: ConfirmCheckbox } | null;
  setState(state: Omit<ConfirmState, 'setState'>): void;
}

export interface ConfirmApi {
  confirmProps: ConfirmProps;
  openConfirm: (opts?: ConfirmState['opts']) => Promise<ConfirmResult>;
}

const useConfirmStore = create<ConfirmState>((set) => ({
  opts: null,
  promise: null,
  setState: (state) => set(() => ({ ...state })),
}));

export function useConfirm(): ConfirmApi {
  const { t } = useTranslation();
  const { promise, opts, setState } = useConfirmStore((state) => state);

  return {
    confirmProps: {
      open: !!promise,
      title: opts?.title || t('CONFIRM.DEFAULT_TITLE'),
      description: opts?.description || '',
      checkbox: opts?.checkbox,
      onCancel: function onCancel() {
        setState({ opts, promise: null });
        promise?.reject();
      },
      onConfirm: function onConfirm(result: ConfirmResult = { checked: false }) {
        setState({ opts, promise: null });
        promise?.resolve(result);
      },
    },
    openConfirm: function openConfirm(opts: ConfirmState['opts'] = {}) {
      return new Promise((resolve, reject) => {
        setState({ promise: { resolve, reject }, opts });
      });
    },
  };
}
