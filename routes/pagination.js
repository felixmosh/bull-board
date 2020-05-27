module.exports = function getPaginationParameters(query) {
  let start = 0
  let end = 9
  if (query.start && query.end) {
    const parsedStart = parseInt(query.start)
    const parsedEnd = parseInt(query.end)
    if (parsedStart !== NaN) {
      start = parsedStart
    }
    if (parsedEnd !== NaN) {
      end = parsedEnd
    }
  }

  return [start, end]
}
