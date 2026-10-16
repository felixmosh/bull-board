import { resolveNotifications } from '../src/notifications/config';
import { formatFailure } from '../src/notifications/format';
import { sendNotification } from '../src/notifications/providers';

const config = resolveNotifications({
  BULL_BOARD_NOTIFICATIONS_ENABLED: 'true',
  BULL_BOARD_DISCORD_ENABLED: 'true',
  BULL_BOARD_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/secret',
  BULL_BOARD_TELEGRAM_ENABLED: 'true',
  BULL_BOARD_TELEGRAM_BOT_TOKEN: '123:secret',
  BULL_BOARD_TELEGRAM_CHAT_ID: '-123',
  BULL_BOARD_NOTIFICATION_BOARD_URL: 'https://queues.example.com/ops/board',
})!;
const event = {
  queue: 'mail /?#',
  prefix: 'bull',
  jobId: 'job /?#',
  reason: '<b>boom</b> & @everyone ```',
  timestamp: Date.UTC(2026, 9, 16, 8, 10),
  lib: 'bullmq' as const,
  queueDisplayName: 'prod:mail /?#',
  jobName: 'send <mail>',
  attemptsMade: 3,
  maxAttempts: 3,
  durationMs: 1250,
};

async function payload(
  channel: 'discord' | 'telegram',
  current = event,
  boardUrl = config.boardUrl
) {
  let body: any;
  await sendNotification(
    config,
    channel,
    formatFailure('Production', current, boardUrl),
    new AbortController().signal,
    async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ ok: true });
    }
  );
  return body;
}

test('Discord embed includes rich details and links using the displayed queue name', async () => {
  const body = await payload('discord');
  expect(body.content).toBeUndefined();
  expect(body.allowed_mentions).toEqual({ parse: [] });
  const embed = body.embeds[0];
  expect(embed).toMatchObject({ color: 0xef4444, timestamp: '2026-10-16T08:10:00.000Z' });
  const jobUrl = new URL(embed.url);
  expect(jobUrl.pathname).toBe('/ops/board/queue/prod%3Amail%20%2F%3F%23/job%20%2F%3F%23');
  const text = JSON.stringify(embed);
  for (const detail of ['Production', 'send <mail>', '3 / 3', '1250 ms', 'BullMQ', 'bull'])
    expect(text).toContain(detail);
  expect(text).toContain('View failed queue');
  expect(text).toContain('status=failed');
});

test('Telegram escapes dynamic HTML and provides inline navigation buttons', async () => {
  const body = await payload('telegram');
  expect(body.parse_mode).toBe('HTML');
  expect(body.text).toContain('&lt;b&gt;boom&lt;/b&gt; &amp; @everyone');
  expect(body.text).toContain('send &lt;mail&gt;');
  expect(body.text).not.toContain('<b>boom</b>');
  const buttons = body.reply_markup.inline_keyboard.flat();
  expect(buttons).toHaveLength(2);
  expect(buttons[0].text).toBe('Open job in Bull Board');
  expect(buttons[1].text).toBe('View failed queue');
  expect(buttons[0].url).toContain('/ops/board/queue/prod%3Amail%20%2F%3F%23/job%20%2F%3F%23');
  expect(body.link_preview_options).toEqual({ is_disabled: true });
});

test('omits links when the public URL is unset and still sends removed-job failures', async () => {
  const minimal = {
    queue: 'gone',
    prefix: 'bull',
    jobId: '99',
    reason: 'removed',
    timestamp: 0,
  } as typeof event;
  const message = formatFailure('Production', minimal);
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.reply_markup).toBeUndefined();
    expect(body.text).toContain('99');
    expect(body.text).not.toContain('undefined');
    return Response.json({ ok: true });
  };
  await sendNotification(config, 'telegram', message, new AbortController().signal, fetcher);
});

test('bounds hostile content for both providers without leaking job data', async () => {
  const huge = {
    ...event,
    reason: '<&😀```'.repeat(10000),
    queue: 'q'.repeat(10000),
    jobId: 'j'.repeat(10000),
    jobName: 'n'.repeat(10000),
    data: { private: 'secret-data' },
  };
  for (const channel of ['discord', 'telegram'] as const) {
    const body = await payload(channel, huge);
    const json = JSON.stringify(body);
    expect(json).not.toContain('secret-data');
    if (channel === 'telegram') expect(body.text.length).toBeLessThanOrEqual(4096);
    else {
      const embed = body.embeds[0];
      expect(embed.url.length).toBeLessThanOrEqual(2048);
      expect(embed.description.length).toBeLessThanOrEqual(4096);
      expect(embed.fields.every((f: any) => f.value.length <= 1024)).toBe(true);
      expect(JSON.stringify(embed).length).toBeLessThanOrEqual(6000);
    }
  }
});

test('keeps Discord link fields valid even with a long public URL', async () => {
  const body = await payload('discord', event, 'https://queues.example.com/' + 'x'.repeat(950));
  expect(body.embeds[0].fields.every((f: any) => f.value.length <= 1024)).toBe(true);
  expect(body.embeds[0].url).toContain('/queue/');
});

test.each(['queue', 'jobId'])(
  'falls back safely when a route identifier contains malformed Unicode (%s)',
  async (field) => {
    const body = await payload('discord', {
      ...event,
      ...(field === 'queue' ? { queueDisplayName: '\ud800' } : { jobId: '\ud800' }),
    });
    expect(body.embeds[0].url).not.toContain('/\ud800');
    expect(body.embeds[0].url).toBe(
      field === 'queue'
        ? config.boardUrl
        : config.boardUrl + '/queue/prod%3Amail%20%2F%3F%23?status=failed'
    );
    expect(body.embeds[0].description).toContain('boom');
  }
);
