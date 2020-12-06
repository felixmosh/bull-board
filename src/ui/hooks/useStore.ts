import qs from 'query-string'
import { useEffect, useRef, useState } from 'react'
import * as api from '../../@types/api'
import { AppJob, QueueActions, SelectedStatuses } from '../../@types/app'
import { Status, STATUS_LIST, PER_PAGE } from '../components/constants'
import { useQueryState } from './useQueryState'

const interval = 5000

type State = {
  data: null | api.GetQueues
  loading: boolean
}

export interface Store {
  state: State
  actions: QueueActions
  selectedStatuses: SelectedStatuses
  page: number
}

export const useStore = (basePath: string): Store => {
  const [state, setState] = useState({
    data: null,
    loading: true,
  } as State)
  const {
    state: { page, selectedStatuses },
    actions: { setPage, setSelectedStatuses },
  } = useQueryState()
  const poll = useRef(undefined as undefined | NodeJS.Timeout)
  const stopPolling = () => {
    if (poll.current) {
      clearTimeout(poll.current)
      poll.current = undefined
    }
  }

  useEffect(() => {
    stopPolling()
    runPolling()

    return stopPolling
  }, [page, selectedStatuses])

  const runPolling = () => {
    update()
      // eslint-disable-next-line no-console
      .catch((error) => console.error('Failed to poll', error))
      .then(() => {
        const timeoutId = setTimeout(runPolling, interval)
        poll.current = timeoutId
      })
  }

  const update = () =>
    fetch(
      `${basePath}/api/queues/?${qs.stringify({
        ...selectedStatuses,
        _start: page * PER_PAGE,
        _end: page * PER_PAGE + PER_PAGE - 1,
      })}`,
    )
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: api.GetQueues) => {
        setState({ data, loading: false })

        if (state.loading) {
          setSelectedStatuses(
            data.queues.reduce((result, queue) => {
              result[queue.name] = result[queue.name] || STATUS_LIST[0]
              return result
            }, {} as Record<string, Status>),
          )
        }
      })

  const promoteJob = (queueName: string) => (job: AppJob) => () =>
    fetch(
      `${basePath}/api/queues/${encodeURIComponent(queueName)}/${
        job.id
      }/promote`,
      {
        method: 'put',
      },
    ).then(update)

  const retryJob = (queueName: string) => (job: AppJob) => () =>
    fetch(
      `${basePath}/api/queues/${encodeURIComponent(queueName)}/${job.id}/retry`,
      {
        method: 'put',
      },
    ).then(update)

  const cleanJob = (queueName: string) => (job: AppJob) => () =>
    fetch(
      `${basePath}/api/queues/${encodeURIComponent(queueName)}/${job.id}/clean`,
      {
        method: 'put',
      },
    ).then(update)

  const retryAll = (queueName: string) => () =>
    fetch(`${basePath}/api/queues/${encodeURIComponent(queueName)}/retry`, {
      method: 'put',
    }).then(update)

  const cleanAllDelayed = (queueName: string) => () =>
    fetch(
      `${basePath}/api/queues/${encodeURIComponent(queueName)}/clean/delayed`,
      {
        method: 'put',
      },
    ).then(update)

  const cleanAllFailed = (queueName: string) => () =>
    fetch(
      `${basePath}/api/queues/${encodeURIComponent(queueName)}/clean/failed`,
      {
        method: 'put',
      },
    ).then(update)

  const cleanAllCompleted = (queueName: string) => () =>
    fetch(
      `${basePath}/api/queues/${encodeURIComponent(queueName)}/clean/completed`,
      {
        method: 'put',
      },
    ).then(update)

  return {
    state,
    actions: {
      promoteJob,
      retryJob,
      retryAll,
      cleanJob,
      cleanAllDelayed,
      cleanAllFailed,
      cleanAllCompleted,
      setSelectedStatuses,
      setPage,
    },
    selectedStatuses,
    page,
  }
}
