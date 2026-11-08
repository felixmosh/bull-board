import type { ConfirmCheckbox, ConfirmResult } from '../components/ConfirmModal/ConfirmModal';

/** What the action sees when no confirm was shown, or when the confirm had no checkbox. */
const NOT_CHECKED: ConfirmResult = { checked: false };

export interface ConfirmActionOptions {
  description: string;
  shouldConfirm: boolean;
  /** Extra opt-in offered alongside the confirmation, resolved into the action's result. */
  checkbox?: ConfirmCheckbox;
  confirmLabel?: string;
  destructive?: boolean;
}

export function getConfirmFor(
  afterAction: () => any,
  openConfirm: (params: Omit<ConfirmActionOptions, 'shouldConfirm'>) => Promise<ConfirmResult>
) {
  return function withConfirmAndFn(
    action: (result: ConfirmResult) => Promise<any>,
    { shouldConfirm, ...confirmOptions }: ConfirmActionOptions
  ) {
    return async () => {
      try {
        const result = shouldConfirm ? await openConfirm(confirmOptions) : NOT_CHECKED;

        await action(result);
        await afterAction();
      } catch (e) {
        if (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        }
      }
    };
  };
}
