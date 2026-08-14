import express from 'express';
import request from 'supertest';
import { basicAuth } from '../src/auth';

// Direct, environment-independent coverage of the constant-time credential comparison. The
// only prior coverage (`cli.spec.ts`'s "enforces basic auth" e2e test) compares a 12 byte
// password ("e2e-password") against a 16 byte one ("not-the-password"), so it only ever
// exercises the length fold in `timingSafeCompare` and never reaches the actual
// `timingSafeEqual` byte comparison on a same-length input. This is the file CodeQL flagged,
// so its correctness needs to be provable here, not just implied by the e2e happy path.
function app() {
  const instance = express();
  instance.use(basicAuth({ user: 'admin', password: 'correct-password' }));
  instance.get('/', (_req, res) => res.status(200).send('ok'));

  return instance;
}

describe('basicAuth', () => {
  it('accepts an exact match', async () => {
    const response = await request(app()).get('/').auth('admin', 'correct-password');

    expect(response.status).toBe(200);
  });

  it('rejects a same-length wrong credential, with a WWW-Authenticate challenge', async () => {
    // Same length as "correct-password" (16 bytes), so this can only fail in
    // `timingSafeEqual`'s actual byte comparison, not the length fold.
    const response = await request(app()).get('/').auth('admin', 'wrong-password!!');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toMatch(/^Basic /);
  });

  it('rejects a shorter supplied credential, with a WWW-Authenticate challenge', async () => {
    const response = await request(app()).get('/').auth('admin', 'short');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toMatch(/^Basic /);
  });

  it('rejects a longer supplied credential, with a WWW-Authenticate challenge', async () => {
    const response = await request(app())
      .get('/')
      .auth('admin', 'this-password-is-much-longer-than-the-real-one');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toMatch(/^Basic /);
  });

  it('rejects an absent Authorization header, with a WWW-Authenticate challenge', async () => {
    const response = await request(app()).get('/');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toMatch(/^Basic /);
  });

  it('rejects "Basic" with no token, with a WWW-Authenticate challenge', async () => {
    const response = await request(app()).get('/').set('Authorization', 'Basic');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toMatch(/^Basic /);
  });

  it('rejects a non-base64 token, with a WWW-Authenticate challenge', async () => {
    // Not valid base64 alphabet -- Buffer.from(..., 'base64') on this decodes to something
    // that is never the expected "admin:correct-password" string, rather than throwing.
    const response = await request(app()).get('/').set('Authorization', 'Basic ###not-base64###');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toMatch(/^Basic /);
  });

  it('rejects a wrong scheme, with a WWW-Authenticate challenge', async () => {
    const token = Buffer.from('admin:correct-password', 'utf8').toString('base64');
    const response = await request(app()).get('/').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toMatch(/^Basic /);
  });
});
