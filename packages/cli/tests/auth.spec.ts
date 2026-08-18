import express from 'express';
import request from 'supertest';
import { basicAuth } from '../src/auth';

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
