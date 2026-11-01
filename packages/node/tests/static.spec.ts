import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'fs/promises';
import { createServer, request as httpRequest, Server } from 'http';
import os from 'os';
import path from 'path';
import { NodeAdapter } from '../src/NodeAdapter';

describe.each([
  { basePath: '', staticRoute: '/static', stripped: false },
  { basePath: '/ui', staticRoute: '/static', stripped: false },
  { basePath: '/ops/queues', staticRoute: '/static', stripped: true },
  { basePath: '/ui', staticRoute: '', stripped: true },
])(
  'native static assets at $basePath$staticRoute, stripped=$stripped',
  ({ basePath, staticRoute, stripped }) => {
    let fixture: string;
    let root: string;
    let outside: string;
    let server: Server;
    let port: number;
    const pending = new Set<Promise<void>>();
    const assetPath = (relative: string) => `${basePath}${staticRoute}${relative}`;

    beforeAll(async () => {
      fixture = await mkdtemp(path.join(os.tmpdir(), 'board-static-'));
      root = path.join(fixture, 'public');
      outside = path.join(fixture, 'private');
      await mkdir(root);
      await mkdir(outside);
      await mkdir(path.join(root, 'assets'));
      await writeFile(path.join(root, 'assets', 'app.js'), 'window.ready = true;');
      await writeFile(path.join(root, 'assets', 'large.bin'), Buffer.alloc(2 * 1024 * 1024, 1));
      for (const extension of ['css', 'svg', 'png', 'woff2', 'json']) {
        await writeFile(path.join(root, 'assets', `asset.${extension}`), 'asset');
      }
      await writeFile(path.join(outside, 'secret.txt'), 'secret');
      await symlink(outside, path.join(root, 'escape'), 'junction');
      const adapter = new NodeAdapter()
        .setBasePath(basePath)
        .setStaticPath(staticRoute || '/', root);
      server = createServer((req, res) => {
        if (stripped) {
          Object.defineProperty(req, 'originalUrl', { value: req.url });
          req.url = req.url?.slice(basePath.length) || '/';
        }
        const handling = adapter
          .handle(req, res)
          .then((handled) => {
            if (!handled) {
              expect(res.headersSent).toBe(false);
              res.end('application');
            }
          })
          .catch(() => {
            res.destroy();
          })
          .finally(() => pending.delete(handling));
        pending.add(handling);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
      port = address.port;
    });

    afterAll(async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
      await Promise.all(pending);
      const resolvedFixture = await realpath(fixture);
      expect(path.dirname(resolvedFixture)).toBe(await realpath(os.tmpdir()));
      expect(path.basename(resolvedFixture)).toMatch(/^board-static-/);
      await rm(resolvedFixture, { recursive: true, force: true });
    });

    function request(
      url: string,
      method = 'GET'
    ): Promise<{ status: number; type?: string; body: string }> {
      return new Promise((resolve, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port, path: url, method }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              type: res.headers['content-type'],
              body: Buffer.concat(chunks).toString(),
            })
          );
          res.on('error', reject);
        });
        req.setTimeout(3000, () => req.destroy(new Error(`timeout: ${url}`)));
        req.on('error', reject);
        req.end();
      });
    }

    it('serves assets for GET and HEAD under nested mounts and query strings', async () => {
      const get = await request(assetPath('/assets/app.js?v=1'));
      expect(get).toMatchObject({
        status: 200,
        type: 'text/javascript; charset=utf-8',
        body: 'window.ready = true;',
      });
      expect(await request(assetPath('/assets/app.js'), 'HEAD')).toMatchObject({
        status: 200,
        body: '',
      });
    });

    it.each([
      ['css', 'text/css; charset=utf-8'],
      ['svg', 'image/svg+xml'],
      ['png', 'image/png'],
      ['woff2', 'font/woff2'],
      ['json', 'application/json; charset=utf-8'],
    ])('serves %s with the expected content type', async (extension, type) => {
      expect(await request(assetPath(`/assets/asset.${extension}`))).toMatchObject({
        status: 200,
        type,
        body: 'asset',
      });
    });

    it('returns finite errors for missing files and directories', async () => {
      expect((await request(assetPath('/nope'))).status).toBe(404);
      expect((await request(assetPath('/assets'))).status).toBe(404);
    });

    it.each([
      '/../private/secret.txt',
      '/%2e%2e/private/secret.txt',
      '/%252e%252e/private/secret.txt',
      '/%ZZ',
      '/%00',
      '/%5c..%5cprivate%5csecret.txt',
      '/C:%5csecret.txt',
      '/%2e%2e%2fprivate%2fsecret.txt',
    ])('rejects unsafe raw path %s', async (url) => {
      const response = await request(assetPath(url));
      expect([400, 404]).toContain(response.status);
      expect(response.body).toBe('');
    });

    it('does not follow a junction outside the asset root', async () => {
      const response = await request(assetPath('/escape/secret.txt'));
      expect([400, 404]).toContain(response.status);
      expect(response.body).toBe('');
    });

    it('leaves unrelated routes untouched', async () => {
      if (staticRoute) {
        expect(await request(`${basePath}${staticRoute}-other/assets/app.js`)).toMatchObject({
          status: 200,
          body: 'application',
        });
      }
      expect(await request('/unrelated')).toMatchObject({ status: 200, body: 'application' });
      expect(await request(assetPath('/assets/app.js'), 'POST')).toMatchObject({
        status: 200,
        body: 'application',
      });
    });

    it('closes an asset stream when the client disconnects', async () => {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(
          { host: '127.0.0.1', port, path: assetPath('/assets/large.bin') },
          (res) => {
            res.once('data', () => req.destroy());
            res.once('close', resolve);
            res.on('error', () => undefined);
          }
        );
        req.setTimeout(3000, () => req.destroy(new Error('disconnect test timed out')));
        req.once('error', (error) => {
          if (error.message !== 'socket hang up') reject(error);
        });
        req.end();
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Static handler did not finish after abort')),
          3000
        );
        void Promise.all(pending).then(() => {
          clearTimeout(timer);
          resolve();
        }, reject);
      });
      expect(await request(assetPath('/assets/app.js'))).toMatchObject({
        status: 200,
        body: 'window.ready = true;',
      });
    });
  }
);
