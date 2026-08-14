import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

/** `timingSafeEqual` requires equal lengths, so compare against a same-length buffer and
 * fold the length comparison into the answer. This leaks the length of the credential
 * and nothing else, which is the same trade-off every constant-time string compare makes. */
function timingSafeCompare(supplied: string, expected: string): boolean {
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  const sameLength = suppliedBytes.length === expectedBytes.length;
  const target = sameLength ? expectedBytes : suppliedBytes;

  return timingSafeEqual(suppliedBytes, target) && sameLength;
}

export function basicAuth({ user, password }: { user: string; password: string }): RequestHandler {
  const expected = `${user}:${password}`;

  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');

    if (scheme?.toLowerCase() === 'basic' && encoded) {
      const supplied = Buffer.from(encoded, 'base64').toString('utf8');

      if (timingSafeCompare(supplied, expected)) {
        next();
        return;
      }
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="bull-board"');
    res.status(401).send('Unauthorized');
  };
}
