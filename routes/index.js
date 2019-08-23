module.exports = async (req, res) => {
  res.render('index', { basePath: req.baseUrl })
}
