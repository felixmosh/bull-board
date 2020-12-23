import React, { useEffect, useState } from 'react'

const basePath = document.head.querySelector('base')?.getAttribute('href') || ''

export const Logs = ({
  queueName,
  jobId,
}: {
  queueName: string
  jobId: string | number | undefined
}) => {
  const [state, setState] = useState([])

  useEffect(() => {
    fetch(
      `${basePath}/api/queues/${encodeURIComponent(queueName)}/${jobId}/logs`
    )
    .then((res) => res.json())
    .then((logs) => setState(logs))
  }, [jobId])

  return (
    <ul>
      {state.map((line, i) => (
        <li key={i}>
          <pre>{line}</pre>
        </li>
      ))}
    </ul>
  )
}
