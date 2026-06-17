import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { HonoAdapter } from '@bull-board/hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { queue } from '@/lib/queue';

// bull-board reads UI assets from disk, so it can't run on the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const basePath = '/api/queues';

const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath(basePath);

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter,
});

const app = new Hono();
app.route(basePath, serverAdapter.registerPlugin());

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
