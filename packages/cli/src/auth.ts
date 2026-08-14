import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

/** Hashing first keeps the comparison constant-time and length-independent. */
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function basicAuth({ user, password }: { user: string; password: string }): RequestHandler {
  const expected = digest(`${user}:${password}`);

  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');

    if (scheme?.toLowerCase() === 'basic' && encoded) {
      const supplied = digest(Buffer.from(encoded, 'base64').toString('utf8'));

      if (timingSafeEqual(expected, supplied)) {
        next();
        return;
      }
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="bull-board"');
    res.status(401).send('Unauthorized');
  };
}
