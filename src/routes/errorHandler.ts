import { Request, Response } from 'express-serve-static-core'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: any, // important argument, don't remove
): void {
  res.status(500).send({
    error: 'Queue error',
    message: err.message,
    details: err.stack,
  })
}
