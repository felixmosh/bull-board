const getDataForQueues = require('./getDataForQueues')

module.exports = async function handler(req, res) {
  const { queuesVersions, queues } = req.app.locals

  res.json(
    await getDataForQueues({
      queues,
      queuesVersions,
      query: req.query,
    }),
  )
}
