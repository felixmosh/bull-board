import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import request from 'supertest';
import { createDemoSearch, renameTenant } from '../demo/demoSearch';
import { RedisSearch } from '../src/RedisSearch';
import { connection } from './connection';
import { until } from './until';

export function demoE2eSuite(): void {
  describe('demo search wiring over the board', () => {
    let redis: IORedis;
    let orders: Queue;
    let emails: Queue;
    let payments: Queue;
    let search: RedisSearch;
    let app: ReturnType<typeof request>;

    const find = async (queue: Queue, field: string, value: string) => {
      const res = await app
        .get(`/api/queues/${queue.name}/search`)
        .query({ field, value })
        .expect(200);
      return res.body.results.map((result: { job: { id: string } }) => result.job.id).sort();
    };

    const indexed = async (queue: Queue, ids: string[]) =>
      (await search.index(queue).known(ids)).every(Boolean);

    beforeAll(async () => {
      redis = new IORedis({ ...connection, maxRetriesPerRequest: null });
      const suffix = Math.random().toString(36).slice(2, 10);
      orders = new Queue(`demo-orders-${suffix}`, { connection });
      emails = new Queue(`demo-emails-${suffix}`, { connection });
      payments = new Queue(`demo-payments-${suffix}`, { connection });
      await Promise.all([orders, emails, payments].map((queue) => queue.waitUntilReady()));

      const demo = createDemoSearch({
        connection: redis,
        indexer: { connection, sweepEvery: false },
        orders,
        emails,
        payments,
      });
      search = demo.search;
      await search.start();

      const serverAdapter = new ExpressAdapter();
      createBullBoard({
        queues: [
          new BullMQAdapter(orders, { search: demo.providers.orders }),
          new BullMQAdapter(emails, { search: demo.providers.emails }),
          new BullMQAdapter(payments, { search: demo.providers.payments }),
        ],
        serverAdapter,
      });
      app = request(serverAdapter.getRouter());
    });

    afterAll(async () => {
      await search?.stop();
      for (const queue of [orders, emails, payments]) {
        if (!queue) continue;
        if (search) {
          const base = search.index(queue).keys.all.replace(/:all$/, '');
          const keys = await redis.keys(`${base}*`);
          if (keys.length > 0) await redis.del(...keys);
        }
        await queue.obliterate({ force: true });
        await queue.close();
      }
      await redis?.quit();
    });

    it('each queue finds its own jobs over HTTP', async () => {
      const [order] = await orders.addBulk([
        { name: 'place-order', data: { tenantId: 'initech', orderId: 'ORD-00001' } },
      ]);
      const [email] = await emails.addBulk([
        { name: 'send-welcome', data: { to: 'ada@example.com' } },
      ]);
      const [payment] = await payments.addBulk([
        { name: 'settle-payment', data: { customerId: 'CUS-1001' } },
      ]);
      await until(
        async () =>
          (await indexed(orders, [order.id!])) &&
          (await indexed(emails, [email.id!])) &&
          (await indexed(payments, [payment.id!]))
      );

      expect(await find(orders, 'data.orderId', 'ORD-00001')).toEqual([order.id]);
      expect(await find(emails, 'data.to', 'ada@example.com')).toEqual([email.id]);
      expect(await find(payments, 'data.customerId', 'CUS-1001')).toEqual([payment.id]);
      expect(await find(emails, 'name', 'send-welcome')).toEqual([email.id]);
      expect(await find(orders, 'data.orderId', 'ada@example.com')).toEqual([]);
    });

    it('renaming a tenant reindexes every matching job', async () => {
      const jobs = await orders.addBulk([
        ...Array.from({ length: 5 }, (_, i) => ({
          name: 'place-order',
          data: { tenantId: 'acme', orderId: `ORD-1${i}` },
        })),
        { name: 'place-order', data: { tenantId: 'globex', orderId: 'ORD-20' } },
      ]);
      const ids = jobs.map((job) => job.id as string);
      await until(() => indexed(orders, ids));
      const acme = ids.slice(0, 5).sort();

      const renamed = await renameTenant(search, orders, 'acme', 'acme-corp');

      expect(renamed).toBe(5);
      expect(await find(orders, 'data.tenantId', 'acme')).toEqual([]);
      expect(await find(orders, 'data.tenantId', 'acme-corp')).toEqual(acme);
      expect(await find(orders, 'data.tenantId', 'globex')).toEqual([ids[5]]);
      expect((await orders.getJob(ids[0]))?.data).toEqual({
        tenantId: 'acme-corp',
        orderId: 'ORD-10',
      });
    });

    it('the sweep drops a removeOnComplete job', async () => {
      const job = await payments.add(
        'settle-payment',
        { customerId: 'CUS-2002' },
        { removeOnComplete: true }
      );
      await until(() => indexed(payments, [job.id!]));
      const worker = new Worker(payments.name, async () => undefined, { connection });
      try {
        await until(async () => (await payments.getJob(job.id!)) === undefined);
      } finally {
        await worker.close();
      }

      await search.indexer(payments).sweep();

      expect(await find(payments, 'data.customerId', 'CUS-2002')).toEqual([]);
    });

    it('jobs added while stopped are found after start', async () => {
      await search.stop();
      const email = await emails.add('send-welcome', { to: 'grace@example.com' });
      const order = await orders.add('place-order', { tenantId: 'hooli', orderId: 'ORD-30' });

      await search.start();
      await until(
        async () => (await indexed(emails, [email.id!])) && (await indexed(orders, [order.id!]))
      );

      expect(await find(emails, 'data.to', 'grace@example.com')).toEqual([email.id]);
      expect(await find(orders, 'data.tenantId', 'hooli')).toEqual([order.id]);
    });

    it('coverage reports nothing missing', async () => {
      for (const queue of [orders, emails, payments]) {
        const res = await app.get(`/api/queues/${queue.name}/search/coverage`).expect(200);
        expect(res.body.missing).toEqual([]);
      }
    });
  });
}
