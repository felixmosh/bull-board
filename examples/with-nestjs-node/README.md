# Native Nest Node example

Run Bull Board at `/queues` on Nest's native Node HTTP platform, with BullMQ queue registration, HTTP Basic authentication, and an application Origin policy. Requires Node.js 24 and Docker for the Redis fixture. The example uses Nest 12.3 or newer within major 12.

This setup uses three Bull Board packages: `@bull-board/api` for the core, `@bull-board/nestjs` for Nest module and queue registration, and `@bull-board/node` for native HTTP transport. This follows the existing Nest Express/Fastify adapter model. Native support does not require existing consumers to change their imports or configuration or install the native packages.

## Run from this checkout

Build the local packages from the repository root first:

```sh
yarn install
docker compose -f docker-compose.redis.yml up -d redis
yarn build
cd examples/with-nestjs-node
npm ci --install-links
npm run build
```

On Windows, the repository build scripts need the Unix tools installed with Git on PATH. In PowerShell, before `yarn build`, run:

```powershell
$env:PATH = 'C:\Program Files\Git\usr\bin;C:\Program Files\Git\bin;' + $env:PATH
```

Set a temporary password and the browser's exact origin, then start the compiled ESM app:

```sh
BULL_BOARD_PASSWORD='choose-a-local-password' BULL_BOARD_ORIGIN='http://localhost:3000' npm start
```

In PowerShell:

```powershell
$env:BULL_BOARD_PASSWORD = 'choose-a-local-password'
$env:BULL_BOARD_ORIGIN = 'http://localhost:3000'
npm start
```

Open `http://localhost:3000/queues`. Sign in as `admin` with the password you set. The dashboard lists the `native-example` queue. The example binds to `127.0.0.1:3000` and requires a password at startup. Use HTTPS when deploying Basic authentication outside local development.

The four Bull Board dependencies use `file:../../packages/...`. `--install-links` copies the local packages into the example instead of symlinking them to the repository's Nest 11 development dependencies. After rebuilding a Bull Board package, refresh those copies before rebuilding the example:

```sh
npm ci --install-links
npm run build
```

`REDIS_HOST` and `REDIS_PORT` override `127.0.0.1:6379`. Keep a local Redis available while the app runs.

## Check HTTP behavior

These commands prompt for the password:

```sh
curl -i http://localhost:3000/queues
curl -u admin http://localhost:3000/queues/api/queues
curl -u admin -X POST http://localhost:3000/queues/api/queues/native-example/add -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' --data '{"name":"example-job","data":{"hello":"native"}}'
```

The first request returns 401 with a Basic challenge. The authenticated requests return 200. The last adds a job visible in the dashboard. In PowerShell, use `curl.exe` for these commands.

Middleware protects HTML, static assets, polling, and mutations. A request without Origin is allowed after authentication. An explicit Origin must equal `BULL_BOARD_ORIGIN`; a different value returns 403. Origin checks supplement authentication. The adapter does not add CORS response headers.

## Mounting and shutdown

`src/main.ts` uses `NodeAdapter as NestNodeAdapter` from `@nestjs/platform-node` to create the HTTP application. `src/app.module.ts` uses `NodeAdapter as BullBoardNodeAdapter` from `@bull-board/node` to register the dashboard. The classes have different responsibilities.

The Nest module calculates the dashboard base path from `route` and any Nest global prefix. Configure global-prefix exclusions for both the entry route and its subtree when excluding the dashboard. Do not strip the path a second time in middleware.

Nest's JSON parser owns bodies by default. The Bull Board adapter reuses a defined parsed body and never reads an ended or destroyed stream again. With Nest's `bodyParser: false`, it reads JSON itself, up to 100 KiB. Malformed JSON returns 400. Empty requests remain valid for actions without a body.

The native handler returns a promise of a boolean. Nest continues downstream only for an unmatched request. Middleware that rejects a request must call `response.end()` and return without calling `next()`.

Press Ctrl+C to stop. `enableShutdownHooks()` lets Nest close the listener and its queue connections. Jobs remain in Redis; shutdown does not delete queue data.
