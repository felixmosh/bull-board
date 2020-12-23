import React, { useEffect, useState } from 'react'
import { STATUSES, Status } from '../components/constants'

import { AppJob } from '../../@types/app'
import { Highlight } from '../components/Highlight/Highlight'
import { Logs } from '../components/Logs/Logs'

const regularItems = ['Data', 'Options', 'Logs']

export function useDetailsTabs(currentStatus: Status, queueName: string) {
  const [tabs, updateTabs] = useState<string[]>([])
  const [selectedTabIdx, setSelectedTabIdx] = useState(0)
  const selectedTab = tabs[selectedTabIdx]

  useEffect(() => {
    updateTabs(
      (currentStatus === STATUSES.failed ? ['Error'] : []).concat(regularItems),
    )
  }, [currentStatus])

  return {
    tabs: tabs.map((title, index) => ({
      title,
      isActive: title === selectedTab,
      selectTab: () => setSelectedTabIdx(index),
    })),
    selectedTab,
    getTabContent: ({
      id,
      data,
      returnValue,
      opts,
      failedReason,
      stacktrace,
    }: AppJob) => {
      switch (selectedTab) {
        case 'Data':
          return (
            <Highlight language="json">
              {JSON.stringify({ data, returnValue }, null, 2)}
            </Highlight>
          )
        case 'Options':
          return (
            <Highlight language="json">
              {JSON.stringify(opts, null, 2)}
            </Highlight>
          )
        case 'Logs': {
          return <Logs jobId={id} queueName={queueName} />
        }
        case 'Error':
          return (
            <>
              {!failedReason && <div className="error">{'NA'}</div>}
              <Highlight language="stacktrace" key="stacktrace">
                {stacktrace}
              </Highlight>
            </>
          )
        default:
          return null
      }
    },
  }
}
