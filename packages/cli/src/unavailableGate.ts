import type { RequestHandler } from 'express';
import { RETRY_INTERVAL_MS, type ConnectionState } from './connectionState';
import { renderDiagnosticPage, STATUS_PATH } from './diagnosticPage';

export { STATUS_PATH };

const JSON_UNAVAILABLE_BODY = {
  error: { key: 'ERRORS.REDIS_UNAVAILABLE' },
  code: 'REDIS_UNAVAILABLE',
};

const RETRY_AFTER_SECONDS = String(Math.ceil(RETRY_INTERVAL_MS / 1000));

export function statusHandler(getState: () => ConnectionState): RequestHandler {
  return (_req, res) => {
    res.json(getState());
  };
}

export function unavailableGate(
  getState: () => ConnectionState,
  { apiPrefix }: { apiPrefix: string }
): RequestHandler {
  return (req, res, next) => {
    if (getState().status === 'connected') {
      next();
      return;
    }

    res.setHeader('Retry-After', RETRY_AFTER_SECONDS);

    if (req.path.startsWith(apiPrefix)) {
      res.status(503).json(JSON_UNAVAILABLE_BODY);
      return;
    }

    if (req.accepts('html')) {
      res.status(503).type('html').send(renderDiagnosticPage(getState()));
      return;
    }

    res.status(503).json(JSON_UNAVAILABLE_BODY);
  };
}
