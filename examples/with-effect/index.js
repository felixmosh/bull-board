import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { EffectAdapter } from '@bull-board/effect';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import { Queue as QueueMQ, Worker } from 'bullmq';
import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { createServer } from 'node:http';

const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t * 1000));

const redisOptions = {
  port: 6379,
  host: 'localhost',
  password: '',
  tls: false,
};

const createQueueMQ = (name) => new QueueMQ(name, { connection: redisOptions });

function setupBullMQProcessor(queueName) {
  new Worker(
    queueName,
    async (job) => {
      for (let i = 0; i <= 100; i++) {
        await sleep(Math.random());
        await job.updateProgress(i);
        await job.log(`Processing job at interval ${i}`);

        if (Math.random() * 200 < 1) throw new Error(`Random error ${i}`);
      }

      return { jobId: `This is the return value of job (${job.id})` };
    },
    { connection: redisOptions }
  );
}

const exampleBullMq = createQueueMQ('BullMQ');
setupBullMQProcessor(exampleBullMq.name);

const serverAdapter = new EffectAdapter();
serverAdapter.setBasePath('/ui');

createBullBoard({
  queues: [new BullMQAdapter(exampleBullMq)],
  serverAdapter,
});

const AddRoute = HttpRouter.add(
  'GET',
  '/add',
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const title = new URL(request.url, 'http://localhost').searchParams.get('title');
    yield* Effect.promise(() => exampleBullMq.add('Add', { title }));
    return HttpServerResponse.jsonUnsafe({ ok: true });
  })
);

const port = 3000;

const ServerLive = HttpRouter.serve(Layer.mergeAll(serverAdapter.registerPlugin(), AddRoute)).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port }))
);

/* eslint-disable no-console */
console.log(`For the UI, open http://localhost:${port}/ui`);
console.log('Make sure Redis is running on port 6379 by default');
console.log('To populate the queue, run:');
console.log(`  curl http://localhost:${port}/add?title=Example`);
/* eslint-enable */

NodeRuntime.runMain(Layer.launch(ServerLive));
