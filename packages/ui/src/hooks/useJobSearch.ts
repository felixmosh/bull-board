import type { GetSearchStatusResponse } from '@bull-board/api/typings/responses';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Status } from '../../typings/app';
import { JobSearchParams } from '../utils/links';
import { queryKeys } from './queryKeys';
import { useApi } from './useApi';
import { useSettingsStore } from './useSettings';

const PAGE_SIZE = 20;
const MAX_EXTRA_PAGES = 5;
const COVERAGE_SAMPLE = 200;
const NO_FIELDS: string[] = [];
const NO_DIAGNOSTICS = { status: false, inspect: false, coverage: false };
const OFFLINE_STATUS: GetSearchStatusResponse = { health: 'down', reasons: [] };

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

  return {
    fields: data?.fields ?? NO_FIELDS,
    diagnostics: data?.diagnostics ?? NO_DIAGNOSTICS,
  };
}

export function useSearchIndexStatus(
  queueName: string,
  enabled: boolean
): GetSearchStatusResponse | undefined {
  const api = useApi();

  const { data, isError } = useQuery({
    queryKey: queryKeys.searchStatus(queueName),
    queryFn: async () => {
      const status = await api.getSearchStatus(queueName);
      return 'error' in status ? OFFLINE_STATUS : status;
    },
    enabled,
    refetchInterval: 15_000,
  });

  return isError ? OFFLINE_STATUS : data;
}

export function useJobSearchInspection(queueName: string, jobId: string, enabled: boolean) {
  const api = useApi();

  return useQuery({
    queryKey: queryKeys.searchInspection(queueName, jobId),
    queryFn: () => api.getJobSearchInspection(queueName, jobId),
    enabled,
  });
}

export function useSearchCoverage(queueName: string) {
  const api = useApi();

  return useMutation({
    mutationFn: () => api.getSearchCoverage(queueName, COVERAGE_SAMPLE),
  });
}

export function useJobSearchResults(
  queueName: string,
  search: JobSearchParams | null,
  status: Status | undefined
) {
  const api = useApi();
  const pollingInterval = useSettingsStore(({ pollingInterval }) => pollingInterval);

  const queryKey = queryKeys.queues.search({
    queueName,
    field: search?.field ?? '',
    value: search?.value ?? '',
    status,
  });
  const searchKey = JSON.stringify(queryKey);
  const [topUp, setTopUp] = useState({ key: searchKey, count: 0 });
  const extraPages = topUp.key === searchKey ? topUp.count : 0;

  const query = useInfiniteQuery({
    queryKey,
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

  const results = query.data?.pages.flatMap((page) => page.results) ?? [];
  const { isSuccess, isPlaceholderData, isFetching, hasNextPage, fetchNextPage } = query;
  const underPage = results.length < PAGE_SIZE;

  useEffect(() => {
    if (
      !isSuccess ||
      isPlaceholderData ||
      isFetching ||
      !hasNextPage ||
      !underPage ||
      extraPages >= MAX_EXTRA_PAGES
    ) {
      return;
    }
    setTopUp({ key: searchKey, count: extraPages + 1 });
    fetchNextPage();
  }, [
    isSuccess,
    isPlaceholderData,
    isFetching,
    hasNextPage,
    underPage,
    extraPages,
    searchKey,
    fetchNextPage,
  ]);

  return {
    results,
    loading: query.isPending,
    isTransitioning: query.isPlaceholderData,
    failed: query.isError,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    searching:
      !query.isError &&
      underPage &&
      !!hasNextPage &&
      (extraPages < MAX_EXTRA_PAGES || query.isFetchingNextPage),
    loadMore: () => {
      setTopUp({ key: searchKey, count: 0 });
      return fetchNextPage();
    },
  };
}
