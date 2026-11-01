import type { IncomingMessage, ServerResponse } from 'node:http';
const password = process.env.BULL_BOARD_PASSWORD;
if (!password) throw new Error('Set BULL_BOARD_PASSWORD before starting the example');
const expected = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
function deny(
  response: ServerResponse,
  status: number,
  body: string,
  headers?: Record<string, string>
): void {
  response.writeHead(status, headers);
  response.end(body);
}
export function boardMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void
): void {
  if (request.headers.authorization !== expected) {
    deny(response, 401, 'Authentication required', {
      'WWW-Authenticate': 'Basic realm="Bull Board"',
    });
    return;
  }
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== process.env.BULL_BOARD_ORIGIN) {
    deny(response, 403, 'Origin denied');
    return;
  }
  next();
}
