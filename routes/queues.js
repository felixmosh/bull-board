const getDataForQeues = require('./getDataForQeues')

module.exports = async function handler(req, res) {
  res.json(
    await getDataForQeues({
      queues: req.app.locals.queues,
      query: req.query,
    }),
  )
}
