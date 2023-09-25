import { create } from 'zustand';
import { ConfirmProps } from '../components/ConfirmModal/ConfirmModal';

interface ConfirmState {
  promise: { resolve: (value: unknown) => void; reject: () => void } | null;
  opts: { title?: string; description?: string } | null;
  setState(state: Omit<ConfirmState, 'setState'>): void;
}

export interface ConfirmApi {
  confirmProps: ConfirmProps;
  openConfirm: (opts?: ConfirmState['opts']) => Promise<unknown>;
}

const useConfirmStore = create<ConfirmState>((set) => ({
  opts: null,
  promise: null,
  setState: (state) => set(() => ({ ...state })),
}));

export function useConfirm(): ConfirmApi {
  const { promise, opts, setState } = useConfirmStore((state) => state);

  return {
    confirmProps: {
      open: !!promise,
      title: opts?.title || 'Are you sure?',
      description: opts?.description || '',
      onCancel: function onCancel() {
        setState({
          opts: { title: opts?.title, description: opts?.description },
          promise: null,
        });
        promise?.reject();
      },
      onConfirm: function onConfirm() {
        setState({
          opts: { title: opts?.title, description: opts?.description },
          promise: null,
        });
        promise?.resolve(undefined);
      },
    },
    openConfirm: function openConfirm(opts: ConfirmState['opts'] = {}) {
      return new Promise((resolve, reject) => {
        setState({ promise: { resolve, reject }, opts });
      });
    },
  };
}
