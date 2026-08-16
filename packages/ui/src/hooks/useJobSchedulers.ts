import type { AppJobScheduler, JobSchedulerRepeatOptions } from '@bull-board/api/typings/app';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { runWithToast } from '../utils/actionToast';
import { getConfirmFor } from '../utils/getConfirmFor';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useConfirm } from './useConfirm';
import { useSettingsStore } from './useSettings';

export function useJobSchedulers(queueName?: string) {
  const api = useApi();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { openConfirm } = useConfirm();
  const { pollingInterval, confirmQueueActions } = useSettingsStore(
    ({ pollingInterval, confirmQueueActions }) => ({ pollingInterval, confirmQueueActions })
  );

  const { data, isPending } = useQuery({
    queryKey: queryKeys.jobSchedulers.list(queueName),
    queryFn: () => api.getJobSchedulers(queueName),
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.jobSchedulers.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.jobSchedulers.count }),
    ]);
  };

  const withConfirmAndUpdate = getConfirmFor(invalidate, openConfirm);

  const remove = (scheduler: AppJobScheduler) =>
    withConfirmAndUpdate(
      () =>
        runWithToast(() => api.removeJobScheduler(scheduler.queueName, scheduler.id), {
          pending: t('SCHEDULERS.TOAST.REMOVE_PENDING', { id: scheduler.id }),
          success: t('SCHEDULERS.TOAST.REMOVE_DONE', { id: scheduler.id }),
        }),
      {
        description: t('SCHEDULERS.CONFIRM.REMOVE', { id: scheduler.id }),
        shouldConfirm: confirmQueueActions,
      }
    );

  /**
   * Resolves to whether the schedule was actually rewritten. A rejected schedule comes back as
   * an error body rather than a throw, and the caller needs to know so the form can stay open
   * on the value the server refused.
   */
  const update = async (
    scheduler: AppJobScheduler,
    repeat: JobSchedulerRepeatOptions
  ): Promise<boolean> => {
    const result = await runWithToast(
      () => api.updateJobScheduler(scheduler.queueName, scheduler.id, repeat),
      {
        pending: t('SCHEDULERS.TOAST.UPDATE_PENDING', { id: scheduler.id }),
        success: t('SCHEDULERS.TOAST.UPDATE_DONE', { id: scheduler.id }),
      }
    );

    if (result && typeof result === 'object' && 'error' in result) {
      return false;
    }

    await invalidate();
    return true;
  };

  return {
    schedulers: data?.schedulers ?? [],
    loading: isPending,
    actions: { remove, update },
  };
}
