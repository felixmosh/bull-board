import { RequestHandler } from 'express'

export const entryPoint: RequestHandler = (req, res) => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
  // @ts-ignore
  const basePath = req.proxyUrl || req.baseUrl

  res.render('index', {
    basePath,
  })
}
