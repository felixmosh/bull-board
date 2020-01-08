const getDataForQeues = require('./getDataForQeues')

module.exports = async function handler(req, res) {
  const { queuesVersions, queues } = req.app.locals

  res.json(
    await getDataForQeues({
      queues,
      queuesVersions,
      query: req.query,
    }),
  )
}
