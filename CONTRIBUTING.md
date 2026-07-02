# Contributing to bull-board

Thanks for your interest in improving bull-board! Issues and pull requests are welcome.

Before opening a new issue, please check the [issues page](https://github.com/felixmosh/bull-board/issues). When reporting a bug, include versions (Node, Redis, Bull/BullMQ, bull-board) and a minimal reproduction.

## Monorepo layout

bull-board is a Yarn 4 workspaces monorepo. The packages live under `packages/*`:

| Package | Description |
| --- | --- |
| `api` | Core library — BullMQ/Bull adapters, queue handlers, server-adapter base |
| `ui` | React UI, built to `dist/` |
| `express`, `fastify`, `hono`, `koa`, `h3`, `hapi`, `nestjs`, `elysia`, `bun` | Server adapters |
| `test-utils` | Private (unpublished) test kit powering the adapter contract tests |

Standalone runnable examples live under `examples/*`, and the documentation site lives under `website/`.

## Prerequisites

- **Node.js 20+** (CI runs on 20, 22, and 24)
- **Yarn 4** — the version is pinned via `packageManager`; enable it with `corepack enable`
- **Redis** on `localhost:6379` — the repo ships a Compose file for this

## Getting started

```sh
git clone git@github.com:felixmosh/bull-board.git
cd bull-board
yarn                # install dependencies
yarn dev:docker     # start Redis (docker-compose.redis.yml)
yarn build          # build all publishable packages
yarn dev            # run the UI + API dev servers
```

The dev server opens at `http://localhost:3000/ui`.

> After changing any `package.json`, run `yarn install` from the repo root to sync the lockfile.

## Running tests

All tests require Redis running (`yarn dev:docker`).

- **Core unit/integration tests** live in `packages/api`. Run them from that directory so the Babel transforms apply:

  ```sh
  cd packages/api
  yarn test
  ```

- **Adapter contract tests** run per workspace:

  ```sh
  yarn workspace @bull-board/express test
  yarn workspace @bull-board/koa test
  # ...one per adapter
  ```

  The `@bull-board/bun` adapter runs under Bun's native runtime (`bun test`) rather than Jest.

## Linting and formatting

The repo uses [oxlint](https://oxc.rs) and oxfmt (no ESLint or Prettier):

```sh
yarn lint:check     # lint (add `yarn lint` to auto-fix)
yarn format:check   # verify formatting (add `yarn format` to write)
```

CI enforces `lint:check` and `format:check`, so run both before opening a PR.

## Running the examples

Each directory under `examples/*` is a self-contained project (Express, Fastify, NestJS, Hono, and more). With Redis running, install and start one directly:

```sh
cd examples/with-express
npm install
npm start
```

## Adding a new server adapter

Adapter coverage is driven by a shared contract battery in the private `@bull-board/test-utils` workspace. Each adapter carries a thin `tests/contract.spec.ts` that adapts its native request mechanism to the normalized shape the contract expects.

To cover a new adapter:

1. Add `@bull-board/test-utils`, `jest`, and `ts-jest` as devDependencies, plus a `"test": "jest"` script.
2. Add a `jest.config.js` (see any existing adapter for the preset).
3. Implement `tests/contract.spec.ts` — spin up the adapter and return a normalized `request` function and a `teardown`. The three existing specs show the pattern for each framework style.
4. Run `yarn install && yarn workspace @bull-board/<name> test`.

## Building

```sh
yarn build
```

The `dist/` output matters: `packages/api` tests and the server adapters resolve `@bull-board/api` from its built `dist/`, so rebuild after changing source. If the root build fails on the Fastify adapter's pre-existing TypeScript error, build the specific workspaces you need instead.

## Submitting changes

- PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/) — this is validated by CI (`Lint PR`), and the changelog is generated from them.
- Keep changes focused, and make sure `yarn lint:check`, `yarn format:check`, and the relevant tests pass.
