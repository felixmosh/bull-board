import { NextFunction } from 'express';
import { Request, Response, RequestHandler } from 'express-serve-static-core';

export const wrapAsync =
  (fn: RequestHandler): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
