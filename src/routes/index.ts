import { RequestHandler } from 'express'

export const entryPoint: RequestHandler = (req, res) => {
  const basePath = req.proxyUrl || req.baseUrl

  res.render('index', { basePath })
}
