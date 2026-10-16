import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NotificationConfig } from '../src/notifications/config';
import { formatFailure } from '../src/notifications/format';
import { sendNotification } from '../src/notifications/providers';
import { NotificationService } from '../src/notifications/service';

const config: NotificationConfig = {
  appName: 'Production',
  timeoutMs: 100,
  maxAttempts: 3,
  retryDelayMs: 10,
  maxPending: 20,
  discord: { webhookUrl: 'https://discord.com/api/webhooks/123/secret', threadId: '456' },
  telegram: { botToken: '123:secret', chatId: '-100123', messageThreadId: 42 },
};
const event = {
  queue: 'payments',
  prefix: 'bull',
  jobId: '99',
  reason: 'Connection refused <error>',
  timestamp: 0,
};
const waitFor = async (check: () => boolean) => {
  const end = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > end) throw new Error('Condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

it('formats only bounded event metadata and preserves Unicode', () => {
  const message = formatFailure('Production', {
    ...event,
    reason: '😀'.repeat(5000),
    data: 'private',
  } as typeof event);
  const text = JSON.stringify(message);
  expect(text).toContain('payments');
  expect(text).toContain('99');
  expect(text).toContain('1970-01-01');
  expect(text).not.toContain('private');
  expect(text.length).toBeLessThanOrEqual(4000);
  expect(text).not.toMatch(/[\uD800-\uDBFF]$/);
});

describe('provider HTTP transport', () => {
  let server: Server;
  let target: string;
  let requests: {
    url: string;
    body: Record<string, unknown>;
    redirect: RequestRedirect | undefined;
  }[];
  let status: number;
  let responseBody: string;
  let headers: Record<string, string>;
  const fetchLocal: typeof fetch = async (url, init) => {
    requests.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
      redirect: init?.redirect,
    });
    return fetch(target, init);
  };
  beforeEach(async () => {
    requests = [];
    status = 200;
    responseBody = '';
    headers = {};
    server = createServer((_req, res) => {
      res.writeHead(status, headers);
      res.end(responseBody);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    target = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('posts a red Discord embed without mentions, with thread and wait', async () => {
    status = 204;
    expect(
      await sendNotification(
        config,
        'discord',
        formatFailure(config.appName, { ...event, reason: 'hello @everyone' }),
        new AbortController().signal,
        fetchLocal
      )
    ).toEqual({ kind: 'sent' });
    expect(requests[0]).toEqual({
      url: 'https://discord.com/api/webhooks/123/secret?wait=true&thread_id=456',
      body: expect.objectContaining({
        embeds: [expect.objectContaining({ color: 0xef4444 })],
        allowed_mentions: { parse: [] },
      }),
      redirect: 'error',
    });
  });

  it('posts escaped Telegram HTML to the configured chat/topic and checks ok', async () => {
    responseBody = JSON.stringify({ ok: true, result: { message_id: 1 } });
    expect(
      await sendNotification(
        config,
        'telegram',
        formatFailure(config.appName, { ...event, reason: '<error>' }),
        new AbortController().signal,
        fetchLocal
      )
    ).toEqual({ kind: 'sent' });
    expect(requests[0].body).toMatchObject({
      parse_mode: 'HTML',
      chat_id: '-100123',
      message_thread_id: 42,
      text: expect.stringContaining('&lt;error&gt;'),
    });
    expect(requests[0].url).toBe('https://api.telegram.org/bot123:secret/sendMessage');
    responseBody = JSON.stringify({ ok: false, error_code: 403, description: 'secret' });
    expect(
      await sendNotification(
        config,
        'telegram',
        formatFailure(config.appName, event),
        new AbortController().signal,
        fetchLocal
      )
    ).toEqual({ kind: 'permanent', code: 'HTTP_403' });
  });

  it('honors provider and HTTP retry-after hints', async () => {
    status = 429;
    headers = { 'retry-after': '2' };
    responseBody = JSON.stringify({ retry_after: 3 });
    expect(
      await sendNotification(
        config,
        'discord',
        formatFailure(config.appName, event),
        new AbortController().signal,
        fetchLocal
      )
    ).toEqual({ kind: 'retryable', code: 'HTTP_429', retryAfterMs: 3000 });
    responseBody = JSON.stringify({ ok: false, parameters: { retry_after: 4 } });
    expect(
      await sendNotification(
        config,
        'telegram',
        formatFailure(config.appName, event),
        new AbortController().signal,
        fetchLocal
      )
    ).toMatchObject({ retryAfterMs: 4000 });
  });

  it.each([
    [500, 'retryable'],
    [503, 'retryable'],
    [401, 'permanent'],
    [404, 'permanent'],
  ])('classifies HTTP %s', async (code, kind) => {
    status = Number(code);
    responseBody = 'secret';
    expect(
      await sendNotification(
        config,
        'discord',
        formatFailure(config.appName, event),
        new AbortController().signal,
        fetchLocal
      )
    ).toEqual({ kind, code: `HTTP_${code}` });
  });

  it('retries a connection lost while reading the response body', async () => {
    const fetchBroken: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('socket reset with secret'));
          },
        })
      );
    expect(
      await sendNotification(
        config,
        'telegram',
        formatFailure(config.appName, event),
        new AbortController().signal,
        fetchBroken
      )
    ).toEqual({ kind: 'retryable', code: 'NETWORK_ERROR' });
  });

  it('ignores malformed retry hints without throwing', async () => {
    status = 429;
    responseBody = '{"retry_after":{"toString":null,"valueOf":null}}';
    expect(
      await sendNotification(
        config,
        'discord',
        formatFailure(config.appName, event),
        new AbortController().signal,
        fetchLocal
      )
    ).toEqual({ kind: 'retryable', code: 'HTTP_429' });
  });

  it('bounds provider response bodies', async () => {
    responseBody = 'x'.repeat(40000);
    expect(
      await sendNotification(
        config,
        'telegram',
        formatFailure(config.appName, event),
        new AbortController().signal,
        fetchLocal
      )
    ).toEqual({ kind: 'permanent', code: 'INVALID_RESPONSE' });
  });
});

describe('bounded delivery service', () => {
  const services: NotificationService[] = [];
  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.close()));
  });
  const make = (
    overrides: Partial<NotificationConfig>,
    fetcher: typeof fetch,
    warnings: string[] = []
  ) => {
    const service = new NotificationService(
      { ...config, ...overrides },
      (message) => warnings.push(message),
      fetcher
    );
    services.push(service);
    return service;
  };

  it('retries transient failures while delivering the other channel independently', async () => {
    let discord = 0,
      telegram = 0;
    const service = make({}, async (url) => {
      if (String(url).includes('discord')) {
        discord++;
        return new Response('', { status: discord < 3 ? 503 : 200 });
      }
      telegram++;
      return Response.json({ ok: true });
    });
    service.notify(event);
    await waitFor(() => telegram === 1);
    await waitFor(() => discord === 3);
    await waitFor(() => service.pendingCount === 0);
  });

  it('never exceeds the shared queued/active cap under a failure flood', async () => {
    const warnings: string[] = [];
    const service = make(
      { maxPending: 3 },
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('secret')), {
            once: true,
          });
        }),
      warnings
    );
    for (let i = 0; i < 10000; i++) service.notify(event);
    expect(service.pendingCount).toBe(3);
    expect(warnings.length).toBe(1);
    await service.close();
    expect(service.pendingCount).toBe(0);
  });

  it('stops after max attempts and does not retry permanent errors', async () => {
    const calls: string[] = [],
      warnings: string[] = [];
    const service = make(
      { maxAttempts: 2 },
      async (url) => {
        calls.push(String(url));
        return new Response('', { status: String(url).includes('discord') ? 401 : 503 });
      },
      warnings
    );
    service.notify(event);
    await waitFor(() => service.pendingCount === 0);
    expect(calls.filter((x) => x.includes('discord'))).toHaveLength(1);
    expect(calls.filter((x) => x.includes('telegram'))).toHaveLength(2);
    expect(warnings.join(' ')).not.toMatch(/secret|webhooks|bot123/);
  });

  it('times out stalled requests and aborts active requests on close', async () => {
    let aborted = 0;
    const service = make(
      { maxAttempts: 1 },
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              aborted++;
              reject(new Error('url with secret'));
            },
            { once: true }
          );
        })
    );
    service.notify(event);
    await waitFor(() => aborted === 2);
    await waitFor(() => service.pendingCount === 0);
    service.notify(event);
    await waitFor(() => service.pendingCount === 2);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await service.close();
    expect(aborted).toBe(4);
    service.notify(event);
    expect(service.pendingCount).toBe(0);
  });

  it('does not send another notification on a rate-limited channel before Retry-After', async () => {
    const times: number[] = [];
    const service = make({ telegram: null }, async () => {
      times.push(Date.now());
      return times.length === 1
        ? new Response('{"retry_after":0.2}', { status: 429 })
        : new Response('');
    });
    service.notify(event);
    service.notify(event);
    await waitFor(() => service.pendingCount === 0);
    expect(times).toHaveLength(3);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(190);
  });
});
