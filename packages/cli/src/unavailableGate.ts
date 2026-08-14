import type { RequestHandler } from 'express';
import type { ConnectionState } from './connectionState';
import { renderDiagnosticPage, STATUS_PATH } from './diagnosticPage';

export { STATUS_PATH };

const JSON_UNAVAILABLE_BODY = {
  error: 'redis_unavailable',
  message: 'bull-board is waiting for Redis to become reachable. See / for details.',
};

export function statusHandler(getState: () => ConnectionState): RequestHandler {
  return (_req, res) => {
    res.json(getState());
  };
}

/** Sits after basic auth and in front of the board router. Steps aside entirely once
 * connected, so it never touches the board's own routes or static assets. */
export function unavailableGate(
  getState: () => ConnectionState,
  { apiPrefix }: { apiPrefix: string }
): RequestHandler {
  return (req, res, next) => {
    if (getState().status === 'connected') {
      next();
      return;
    }

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
