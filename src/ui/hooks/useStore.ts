import { useEffect, useRef, useState } from 'react'
import * as api from '../../@types/api'
import { AppJob, QueueActions, SelectedStatuses } from '../../@types/app'
import { Status, STATUS_LIST } from '../components/constants'
import { Api } from '../services/Api'

const interval = 5000

type State = {
  data: null | api.GetQueues
  loading: boolean
}

export interface Store {
  state: State
  actions: QueueActions
  selectedStatuses: SelectedStatuses
}

export const useStore = (api: Api): Store => {
  const [state, setState] = useState({
    data: null,
    loading: true,
  } as State)
  const [selectedStatuses, setSelectedStatuses] = useState(
    {} as SelectedStatuses,
  )

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
  }, [selectedStatuses])

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
    api.getQueues({ status: selectedStatuses }).then((data: api.GetQueues) => {
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
    api.promoteJob(queueName, job.id).then(update)

  const retryJob = (queueName: string) => (job: AppJob) => () =>
    api.retryJob(queueName, job.id).then(update)

  const cleanJob = (queueName: string) => (job: AppJob) => () =>
    api.cleanJob(queueName, job.id).then(update)

  const retryAll = (queueName: string) => () =>
    api.retryAll(queueName).then(update)

  const cleanAllDelayed = (queueName: string) => () =>
    api.cleanAllDelayed(queueName).then(update)

  const cleanAllFailed = (queueName: string) => () =>
    api.cleanAllFailed(queueName).then(update)

  const cleanAllCompleted = (queueName: string) => () =>
    api.cleanAllCompleted(queueName).then(update)

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
    },
    selectedStatuses,
  }
}
