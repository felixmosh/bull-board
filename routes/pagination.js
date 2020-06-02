module.exports = function getPaginationParameters(query) {
  let start = 0
  let end = 9
  if (query.start && query.end) {
    const parsedStart = parseInt(query.start)
    const parsedEnd = parseInt(query.end)
    if (!Number.isNaN(parsedStart)) {
      start = parsedStart
    }
    if (!Number.isNaN(parsedEnd)) {
      end = parsedEnd
    }
  }

  return [start, end]
}
