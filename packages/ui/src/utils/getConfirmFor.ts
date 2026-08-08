import type { ConfirmCheckbox, ConfirmResult } from '../components/ConfirmModal/ConfirmModal';

/** What the action sees when no confirm was shown, or when the confirm had no checkbox. */
const NOT_CHECKED: ConfirmResult = { checked: false };

export function getConfirmFor(
  afterAction: () => any,
  openConfirm: (params: {
    description: string;
    checkbox?: ConfirmCheckbox;
  }) => Promise<ConfirmResult>
) {
  return function withConfirmAndFn(
    action: (result: ConfirmResult) => Promise<any>,
    description: string,
    shouldConfirm: boolean,
    checkbox?: ConfirmCheckbox
  ) {
    return async () => {
      try {
        const result = shouldConfirm ? await openConfirm({ description, checkbox }) : NOT_CHECKED;

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
