import { useState } from 'react';
import { ConfirmProps } from '../components/ConfirmModal/ConfirmModal';

interface ConfirmState {
  promise: { resolve: (value: unknown) => void; reject: () => void } | null;
  opts: { title?: string; description?: string };
}

export interface ConfirmApi {
  confirmProps: ConfirmProps;
  openConfirm: (opts?: ConfirmState['opts']) => Promise<unknown>;
}

export function useConfirm(): ConfirmApi {
  const [confirmData, setConfirmData] = useState<ConfirmState | null>(null);

  function openConfirm(opts: ConfirmState['opts'] = {}) {
    return new Promise((resolve, reject) => {
      setConfirmData({ promise: { resolve, reject }, opts });
    });
  }

  return {
    confirmProps: {
      open: !!confirmData?.promise,
      title: confirmData?.opts.title || 'Are you sure?',
      description: confirmData?.opts.description || '',
      onCancel: () => {
        setConfirmData({
          opts: { title: confirmData?.opts.title, description: confirmData?.opts.description },
          promise: null,
        });
        confirmData?.promise?.reject();
      },
      onConfirm: () => {
        setConfirmData({
          opts: { title: confirmData?.opts.title, description: confirmData?.opts.description },
          promise: null,
        });
        confirmData?.promise?.resolve(undefined);
      },
    },
    openConfirm,
  };
}
