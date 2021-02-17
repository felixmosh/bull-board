import React, { useEffect, useState } from 'react'
import { AppJob } from '../../@types/app'
import { Status, STATUSES } from '../components/constants'
import { Highlight } from '../components/Highlight/Highlight'

const regularItems = ['Data', 'Options']

export function useDetailsTabs(currentStatus: Status) {
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
        case 'Error':
          return (
            <>
              {stacktrace.length === 0 ? (
                <div className="error">
                  {!!failedReason ? failedReason : 'NA'}
                </div>
              ) : (
                <Highlight language="stacktrace" key="stacktrace">
                  {stacktrace}
                </Highlight>
              )}
            </>
          )
        default:
          return null
      }
    },
  }
}
