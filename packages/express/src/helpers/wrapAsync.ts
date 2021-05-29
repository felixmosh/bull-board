import { ParamsDictionary, RequestHandler } from 'express-serve-static-core';

export const wrapAsync = <Params extends ParamsDictionary>(
  fn: RequestHandler<Params>
): RequestHandler<Params> => async (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
