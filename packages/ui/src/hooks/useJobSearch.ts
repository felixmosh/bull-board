import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Status } from '../../typings/app';
import { JobSearchParams } from '../utils/links';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useSettingsStore } from './useSettings';

const PAGE_SIZE = 20;

export function useJobSearchParams(): JobSearchParams | null {
  const params = new URLSearchParams(useLocation().search);
  const field = params.get('field');
  const value = params.get('q')?.trim();
  return field && value ? { field, value } : null;
}

export function useSearchFields(queueName: string, enabled: boolean) {
  const api = useApi();

  const { data } = useQuery({
    queryKey: queryKeys.searchFields(queueName),
    queryFn: () => api.getSearchFields(queueName),
    enabled,
    staleTime: 60_000,
  });

  return data?.fields ?? [];
}

export function useJobSearchResults(
  queueName: string,
  search: JobSearchParams | null,
  status: Status | undefined
) {
  const api = useApi();
  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);

  const query = useInfiniteQuery({
    queryKey: queryKeys.queues.search({
      queueName,
      field: search?.field ?? '',
      value: search?.value ?? '',
      status,
    }),
    queryFn: ({ pageParam }) =>
      api.searchJobs(queueName, {
        field: search!.field,
        value: search!.value,
        status,
        cursor: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor,
    enabled: !!search,
    refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
    placeholderData: keepPreviousData,
  });

  return {
    results: query.data?.pages.flatMap((page) => page.results) ?? [],
    loading: query.isPending,
    isTransitioning: query.isPlaceholderData,
    failed: query.isError,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => query.fetchNextPage(),
  };
}
