import React from 'react'
import { getYear, format, isToday, formatDistance } from 'date-fns'

const today = new Date()
type TimeStamp = number | Date

const formatDate = (ts: TimeStamp) => {
  if (isToday(ts)) {
    return format(ts, 'HH:mm:ss')
  }

  return getYear(ts) === getYear(today)
    ? format(ts, 'MM/dd HH:mm:ss')
    : format(ts, 'MM/dd/yyyy HH:mm:ss')
}

export const Timestamp = ({
  ts,
  prev,
}: {
  ts: TimeStamp | null
  prev?: TimeStamp | null
}) => {
  if (ts === null) {
    return null
  }

  const date = formatDate(ts)

  return (
    <>
      {date}{' '}
      {prev && (
        <small>({formatDistance(ts, prev, { includeSeconds: true })})</small>
      )}
    </>
  )
}
