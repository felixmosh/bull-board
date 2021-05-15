import { Request, RequestHandler, Response } from 'express-serve-static-core';

export const entryPoint: RequestHandler = (req: Request, res: Response) => {
  const basePath = (req as any).proxyUrl || req.baseUrl;

  res.render('index', {
    basePath,
  });
};
