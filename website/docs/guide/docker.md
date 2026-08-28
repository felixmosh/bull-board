---
description: Run the bull-board dashboard as a Docker container with the official ghcr.io/felixmosh/bull-board image, with Docker Compose, environment variables and basic auth.
---

# Run with Docker

`ghcr.io/felixmosh/bull-board` is the official image. It is the [standalone CLI](/guide/cli) packaged with a Node runtime, so the dashboard runs as its own container next to your Redis, with nothing to install on the host and no application to wire the adapter into. It is the right way to self-host bull-board when the workers live somewhere you are not editing, when the producers are not Node at all, or when you just want a dashboard on a box without deploying an app to carry it.

```sh
docker run --rm -p 127.0.0.1:3000:3000 \
  -e BULL_BOARD_USER=admin -e BULL_BOARD_PASSWORD=secret \
  ghcr.io/felixmosh/bull-board --redis redis://host.docker.internal:6379
```

That serves the dashboard on `http://127.0.0.1:3000`, showing every Bull and BullMQ queue it finds under the `bull` key prefix. `host.docker.internal` is how a container reaches a Redis running on the host: Docker Desktop provides it, and on plain Docker Engine you add `--add-host host.docker.internal:host-gateway` to the command.

## What is in the image

A `node:22-alpine` base and the published `@bull-board/cli` package, nothing else. It is about 63 MB, built for `linux/amd64` and `linux/arm64`, and it runs as the unprivileged `node` user.

The entrypoint is the CLI itself, so everything after the image name is a flag exactly as the [CLI guide](/guide/cli#options) documents it, and every `BULL_BOARD_*` environment variable works the same way. The image has no configuration of its own to learn. It only presets the two CLI defaults that make no sense inside a container:

| Variable | Image default | Why |
|---|---|---|
| `BULL_BOARD_HOST` | `0.0.0.0` | The CLI default `127.0.0.1` only accepts connections from inside the container |
| `BULL_BOARD_OPEN` | `false` | There is no browser in the container to open |

Both are ordinary environment variables, so `--host` or your own `-e BULL_BOARD_HOST` still wins.

The image also declares a `HEALTHCHECK` that polls the dashboard on its own port, so `depends_on: { bull-board: { condition: service_healthy } }` works for anything you want to start behind it. Basic auth does not interfere with it, since a 401 still proves the server is answering.

## Tags

| Tag | Points at |
|---|---|
| `latest` | The newest release |
| `9` | The newest release in that major |
| `9.5.0` | That exact release, forever |

Pin the exact version for anything you would be unhappy to see change under you, and the major if you want patches without surprises. The [package page](https://github.com/felixmosh/bull-board/pkgs/container/bull-board) lists every tag that exists.

## Docker Compose

Alongside a Redis of your own:

```yaml
services:
  redis:
    image: redis:latest
    ports:
      - '6379:6379'

  bull-board:
    image: ghcr.io/felixmosh/bull-board:9
    command: --redis redis://redis:6379
    environment:
      BULL_BOARD_USER: ${BULL_BOARD_USER}
      BULL_BOARD_PASSWORD: ${BULL_BOARD_PASSWORD}
    ports:
      - '127.0.0.1:3000:3000'
    depends_on:
      - redis
```

Nothing here is Compose specific. The image is an ordinary container listening on port 3000, so any orchestrator runs it the same way.

## Configuring it

Flags after the image name, `BULL_BOARD_*` variables, and a config file all work, and they resolve in that order. The [environment variable table](/guide/cli#environment-variables) in the CLI guide is the full list. The ones that come up most in a container:

```sh
docker run --rm -p 127.0.0.1:3000:3000 \
  -e BULL_BOARD_REDIS_URL=redis://redis:6379 \
  -e BULL_BOARD_PREFIX=bull,tenant-a \
  -e BULL_BOARD_READ_ONLY=true \
  -e BULL_BOARD_BOARD_TITLE='Ops Dashboard' \
  ghcr.io/felixmosh/bull-board
```

For anything longer, mount a [config file](/guide/cli#config-file). The working directory is `/app`, which is where the CLI looks, so a file mounted there is picked up with no `--config` flag, as long as it is readable by uid 1000:

```yaml
    volumes:
      - ./bull-board.config.js:/app/bull-board.config.js:ro
```

Serving the dashboard under a path prefix, which is what you want behind a reverse proxy that routes on the path, is `--base-path`:

```sh
docker run --rm -p 127.0.0.1:3000:3000 \
  ghcr.io/felixmosh/bull-board --redis redis://redis:6379 --base-path /queues
```

## Keeping it private

The container listens on every interface inside itself, so `BULL_BOARD_USER` and `BULL_BOARD_PASSWORD` (or `--user` and `--password`) are not optional here, and the port mapping above publishes to `127.0.0.1` on the host rather than every interface. The CLI warns at startup if it is bound to a non-loopback host with no auth configured, since that combination is an unauthenticated dashboard, complete with delete-job and obliterate-queue, reachable from anywhere that can route to the host. `--read-only` disables every destructive action if all you need is visibility.

Basic auth over plain HTTP still sends credentials in the clear. Exposing the port beyond the host, whether that is a routable address, a cloud security group, or a reverse proxy without TLS, needs an SSH tunnel or a TLS-terminating proxy in front regardless of whether auth is configured.

## Building it yourself

The `Dockerfile` at the root of the repository is what produces the published image, and it takes the CLI version as a build argument:

```sh
docker build --build-arg BULL_BOARD_VERSION=9.5.0 -t bull-board .
```

Useful if you need a different base image, a digest you pinned yourself, or an internal registry.

## Without an image

The CLI also runs from npm inside a stock Node container, which pins nothing and needs egress to the registry on every start:

```yaml
  bull-board:
    image: node:22-alpine
    command: npx -y @bull-board/cli --redis redis://redis:6379 --host 0.0.0.0 --no-open
    environment:
      BULL_BOARD_USER: ${BULL_BOARD_USER}
      BULL_BOARD_PASSWORD: ${BULL_BOARD_PASSWORD}
    ports:
      - '127.0.0.1:3000:3000'
    depends_on:
      - redis
```

`--host 0.0.0.0` and `--no-open` are explicit here, since only the bull-board image presets them.
