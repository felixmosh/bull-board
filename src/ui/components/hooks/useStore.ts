import { useEffect, useRef, useState } from 'react'
import qs from 'querystring'

const interval = 5000

export const useStore = (basePath: string) => {
  const [state, setState] = useState({
    data: null,
    loading: true,
  } as any)
  const [selectedStatuses, setSelectedStatuses] = useState({} as any)

  const poll = useRef()
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
      .catch(error => console.error('Failed to poll', error))
      .then(() => {
        const timeoutId = setTimeout(runPolling, interval)
        poll.current = timeoutId as any
      })
  }

  const update = () =>
    fetch(`${basePath}/queues/?${qs.encode(selectedStatuses)}`)
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then(data => setState({ data, loading: false }))

  const retryJob = (queueName: string) => (job: { id: string }) => () =>
    fetch(`${basePath}/queues/${queueName}/${job.id}/retry`, {
      method: 'put',
    }).then(update)

  const retryAll = (queueName: string) => () =>
    fetch(`${basePath}/queues/${queueName}/retry`, {
      method: 'put',
    }).then(update)

  const cleanAllDelayed = (queueName: string) => () =>
    fetch(`${basePath}/queues/${queueName}/clean/delayed`, {
      method: 'put',
    }).then(update)

  const cleanAllFailed = (queueName: string) => () =>
    fetch(`${basePath}/queues/${queueName}/clean/failed`, {
      method: 'put',
    }).then(update)

  return {
    state,
    retryJob,
    retryAll,
    cleanAllDelayed,
    cleanAllFailed,
    selectedStatuses,
    setSelectedStatuses,
  }
}
