module.exports = async (req, res) => {
  const basePath = req.proxyUrl || req.baseUrl
  res.render('index', { basePath })
}
