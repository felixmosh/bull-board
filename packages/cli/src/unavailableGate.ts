import type { RequestHandler } from 'express';
import { RETRY_INTERVAL_MS, type ConnectionState } from './connectionState';
import { renderDiagnosticPage, STATUS_PATH } from './diagnosticPage';

export { STATUS_PATH };

// Every API error body carries a translation key rather than hardcoded English, same as the
// rest of the API (see `packages/api/src/errors.ts`): a stale dashboard tab is still polling
// this endpoint through an outage, and the UI renders `error.key` through i18next.
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
