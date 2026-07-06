# Set up with an AI agent

If you work with a coding agent (Claude Code, Cursor, Copilot, Windsurf, whatever), you don't have to hand-wire bull-board. Paste the prompt below and let the agent do the mechanical part: install the packages, mount the adapter, match the base path. Then read the diff.

## Copy this prompt

```text
Add bull-board to my app so I can inspect my Bull/BullMQ queues in a browser.

Use the current docs at https://felixmosh.github.io/bull-board/llms.txt as the
source of truth. Don't rely on memory, the API has changed across versions.

Requirements:
- Detect my HTTP framework (Express, Fastify, NestJS, Koa, Hapi, Hono, H3,
  Elysia, or Bun) and install @bull-board/api plus the matching @bull-board/<framework> adapter.
- Detect whether I use Bull or BullMQ and wrap each existing queue in the right
  queue adapter (BullMQAdapter or BullAdapter). Reuse my existing queue
  instances and Redis connection, don't create new ones.
- Create the server adapter, call setBasePath('/admin/queues'), pass my queues to
  createBullBoard, and mount the router at the SAME path ('/admin/queues'). The
  base path and the mount path must match exactly or the assets 404.
- Do not expose it unauthenticated. If I have auth middleware, put the dashboard
  behind it; if I don't, add a TODO and tell me, don't invent credentials.
- Show me the diff and the URL to open. Don't add options that aren't in the docs.
```

Swap the base path (`/admin/queues`) for wherever you want the dashboard to live. The agent should handle the rest, including the one thing people get wrong by hand: keeping `setBasePath` and the mount path identical.

## Point your agent at the current docs

This documentation site publishes machine-readable versions of itself, generated on every build:

- [`llms.txt`](https://felixmosh.github.io/bull-board/llms.txt): a concise index of every page.
- [`llms-full.txt`](https://felixmosh.github.io/bull-board/llms-full.txt): the full text of the docs in one file.

Feed either to an agent (or an "ask the docs" tool) so it works from the current API surface instead of whatever it remembers from training. The `llms-full.txt` version is the one to use when you want it to get option names and defaults exactly right.

## After the agent is done

The agent gets you mounted. These are on you:

- [Add auth](/recipes/basic-auth) before anything reachable from outside localhost. Agents will happily leave the dashboard wide open.
- [Read-only mode](/recipes/read-only-mode) if the people opening it shouldn't be retrying or obliterating queues.
- [Alerting](/recipes/alerting): the dashboard shows failures, it doesn't tell you about them. Wire that separately.

If the page loads but looks broken, it's almost always a base-path mismatch. See [Troubleshooting](/recipes/troubleshooting).
