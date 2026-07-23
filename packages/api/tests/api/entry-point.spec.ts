import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { entryPoint } from '@bull-board/api/dist/handlers/entryPoint';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

describe('entryPoint handler', () => {
  const baseUiConfig = { boardTitle: 'My Board' } as any;

  it('renders the index view', () => {
    const result = entryPoint({ basePath: '/ui', uiConfig: baseUiConfig });
    expect(result.name).toBe('index.ejs');
  });

  it('appends a trailing slash to a basePath that lacks one', () => {
    const result = entryPoint({ basePath: '/ui', uiConfig: baseUiConfig });
    expect(result.params.basePath).toBe('/ui/');
  });

  it('leaves an already-trailing-slash basePath unchanged', () => {
    const result = entryPoint({ basePath: '/ui/', uiConfig: baseUiConfig });
    expect(result.params.basePath).toBe('/ui/');
  });

  it('escapes angle brackets in the serialized uiConfig', () => {
    const result = entryPoint({
      basePath: '',
      uiConfig: { boardTitle: '<script>alert(1)</script>' } as any,
    });
    expect(result.params.uiConfig).not.toContain('<');
    expect(result.params.uiConfig).not.toContain('>');
    expect(result.params.uiConfig).toContain('\\u003c');
  });

  it('passes the board title through', () => {
    const result = entryPoint({ basePath: '/', uiConfig: baseUiConfig });
    expect(result.params.title).toBe('My Board');
  });

  it('extracts favicon variants when present', () => {
    const result = entryPoint({
      basePath: '/',
      uiConfig: {
        boardTitle: 'B',
        favIcon: { default: '/d.png', alternative: '/a.png' },
      } as any,
    });
    expect(result.params.favIconDefault).toBe('/d.png');
    expect(result.params.favIconAlternative).toBe('/a.png');
  });

  it('tolerates a missing favIcon', () => {
    const result = entryPoint({ basePath: '/', uiConfig: baseUiConfig });
    expect(result.params.favIconDefault).toBeUndefined();
    expect(result.params.favIconAlternative).toBeUndefined();
  });
});

describe('entry point routes', () => {
  let serverAdapter: ExpressAdapter;
  const queueList: Queue[] = [];
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
    queueList.length = 0;
  });

  afterEach(async () => {
    for (const queue of queueList) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
  });

  function assertServesShell(res: request.Response) {
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('<base href');
    expect(res.text).toContain('id="__UI_CONFIG__"');
  }

  it('serves the SPA shell on /', async () => {
    const queue = new Queue('EntryPointRouteQueue', { connection });
    queueList.push(queue);

    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

    const res = await request(serverAdapter.getRouter()).get('/').expect(200);
    assertServesShell(res);
  });

  it('serves the SPA shell on /metrics-history (regression: used to 404)', async () => {
    const queue = new Queue('EntryPointRouteQueue', { connection });
    queueList.push(queue);

    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

    const res = await request(serverAdapter.getRouter()).get('/metrics-history').expect(200);
    assertServesShell(res);
  });

  it('serves the SPA shell on /queue/:queueName', async () => {
    const queue = new Queue('EntryPointRouteQueue', { connection });
    queueList.push(queue);

    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

    const res = await request(serverAdapter.getRouter()).get(`/queue/${queue.name}`).expect(200);
    assertServesShell(res);
  });
});
