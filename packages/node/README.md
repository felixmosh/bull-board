# @bull-board/node

Native Node HTTP server adapter for Bull Board. Serves dashboard HTML, static assets, and the queue API through `IncomingMessage` and `ServerResponse`.

## Install

After the release containing this adapter is published, standalone Node HTTP applications install:

```sh
npm install @bull-board/api @bull-board/node
```

Nest applications install the core, Nest module, and native server adapter:

```sh
npm install @bull-board/api @bull-board/nestjs @bull-board/node
```

This follows the existing Nest Express/Fastify adapter package model. `@bull-board/nestjs` handles module and queue registration; `@bull-board/node` provides HTTP transport and also works outside Nest.

Native Nest support requires Nest 12.3+ within major 12 and `@nestjs/platform-node`. Existing Nest Express/Fastify consumers keep their imports, configuration, supported Nest versions, and installation requirements. They do not need either native package.

## Usage

- [Node HTTP guide](https://felixmosh.github.io/bull-board/server-adapters/node) for `handle(request, response): Promise<boolean>` and standalone mounting.
- [Native Nest guide](https://felixmosh.github.io/bull-board/server-adapters/nestjs#native-node-platform) for aliased adapters, module setup, middleware and lifecycle rules.
- [Runnable native Nest example](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-node) for running this checkout before publication with local built packages.
