const getDataForQueues = require('./getDataForQueues')

module.exports = async function handler(req, res) {
  const { queues } = req.app.locals

  res.json(
    await getDataForQueues({
      queues,
      query: req.query,
    }),
  )
}
