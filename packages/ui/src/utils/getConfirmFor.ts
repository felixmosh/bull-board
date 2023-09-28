export function getConfirmFor(
  fn: () => any,
  openConfirm: (params: { description: string }) => Promise<any>
) {
  return function withConfirmAndFn(
    action: () => Promise<any>,
    description: string,
    shouldConfirm: boolean
  ) {
    return async () => {
      try {
        if (shouldConfirm) {
          await openConfirm({ description });
        }
        await action();
        await fn();
      } catch (e) {
        if (e) {
          // eslint-disable-next-line no-console
          console.error(e);
        }
      }
    };
  };
}
