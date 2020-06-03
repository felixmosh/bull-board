const DEFAULT_PAGINATION_SIZE = 10

module.exports = function getPaginationParameters(query) {
  // default pagination indices
  let start = 0
  let end = DEFAULT_PAGINATION_SIZE - 1
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
