export interface FailedJobEvent {
  queue: string;
  prefix: string;
  jobId: string;
  reason: string;
  timestamp: number;
  lib?: 'bull' | 'bullmq';
  queueDisplayName?: string;
  jobName?: string;
  attemptsMade?: number;
  maxAttempts?: number;
  durationMs?: number;
}

export interface FailureMessage {
  title: string;
  fields: { name: string; value: string; inline: boolean }[];
  error: string;
  timestamp: string;
  links?: { board: string; job?: string; queue?: string };
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - 1;
  if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return `${text.slice(0, end)}…`;
}

// Encode complete route segments, including punctuation meaningful to Markdown links.
function segment(value: string): string | undefined {
  if (value.length > 2048) return undefined;
  try {
    return encodeURIComponent(value).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
  } catch {
    // A malformed display prefix must not stop the failure notification itself.
    return undefined;
  }
}

export function formatFailure(
  appName: string,
  event: FailedJobEvent,
  boardUrl?: string
): FailureMessage {
  const fields: FailureMessage['fields'] = [];
  const add = (name: string, value: string) =>
    fields.push({ name, value: truncate(value || '—', 220), inline: true });
  add('Queue', event.queue);
  add('Prefix', event.prefix);
  if (event.lib) add('Engine', event.lib === 'bullmq' ? 'BullMQ' : 'Bull');
  add('Job ID', event.jobId);
  if (event.jobName) add('Job name', event.jobName);
  if (event.attemptsMade !== undefined)
    add(
      'Attempts',
      `${event.attemptsMade}${event.maxAttempts !== undefined ? ` / ${event.maxAttempts}` : ''}`
    );
  if (event.durationMs !== undefined) add('Processing time', `${event.durationMs} ms`);
  const message: FailureMessage = {
    title: `🔴 [${truncate(appName, 120)}] Job failed`,
    fields,
    error: truncate(event.reason || 'Unknown failure', 900),
    timestamp: new Date(event.timestamp).toISOString(),
  };
  if (boardUrl) {
    const queueName = event.queueDisplayName ?? event.queue;
    const encodedQueue = segment(queueName);
    const encodedJob = segment(event.jobId);
    const queuePath = encodedQueue === undefined ? undefined : `${boardUrl}/queue/${encodedQueue}`;
    const job = queuePath && encodedJob !== undefined ? `${queuePath}/${encodedJob}` : undefined;
    const queue = queuePath ? `${queuePath}?status=failed` : undefined;
    // Never truncate identifiers into a link to a different job. Keep the dashboard fallback.
    const validQueue = queue && queue.length <= 2048 && !['.', '..'].includes(queueName);
    message.links = {
      board: boardUrl,
      ...(validQueue ? { queue } : {}),
      ...(validQueue && job && job.length <= 2048 && !['.', '..'].includes(event.jobId)
        ? { job }
        : {}),
    };
  }
  return message;
}

const code = (text: string) => `\`${text.replace(/`/g, 'ˋ').replace(/[\r\n]/g, ' ')}\``;

// Limit escaped output rather than slicing entities or surrogate pairs halfway through.
function html(text: string, max: number): string {
  let result = '';
  for (const char of text) {
    const escaped = char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char;
    if (result.length + escaped.length > max - 1) return `${result}…`;
    result += escaped;
  }
  return result;
}

export function discordPayload(message: FailureMessage): object {
  const links = message.links;
  const fields = message.fields.map((field) => ({ ...field, value: code(field.value) }));
  if (links) {
    const link = (label: string, url: string) =>
      `[${label}](${url.replace(/[()]/g, (char) => (char === '(' ? '%28' : '%29'))})`;
    const navigation = [
      links.job ? link('Open job in Bull Board', links.job) : link('Open Bull Board', links.board),
      ...(links.queue ? [link('View failed queue', links.queue)] : []),
    ];
    const combined = navigation.join(' · ');
    const value =
      combined.length <= 1024 ? combined : navigation.find((item) => item.length <= 1024);
    // The embed title remains clickable even when URLs are too long for a field.
    if (value) fields.push({ name: 'Bull Board', value, inline: false });
  }
  return {
    embeds: [
      {
        title: message.title,
        color: 0xef4444,
        description: `**Error**\n\`\`\`\n${message.error.replace(/`/g, 'ˋ')}\n\`\`\``,
        fields,
        timestamp: message.timestamp,
        footer: { text: 'Final failure · Automatic processing stopped' },
        ...(links ? { url: links.job ?? links.queue ?? links.board } : {}),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

export function telegramPayload(message: FailureMessage): object {
  const links = message.links;
  const buttons = links
    ? [
        {
          text: links.job ? 'Open job in Bull Board' : 'Open Bull Board',
          url: links.job ?? links.board,
        },
        ...(links.queue ? [{ text: 'View failed queue', url: links.queue }] : []),
      ]
    : [];
  return {
    parse_mode: 'HTML',
    text: [
      `<b>${html(message.title, 200)}</b>`,
      '<i>Final failure · Automatic processing stopped</i>',
      '',
      ...message.fields.map(
        (field) => `<b>${field.name}:</b> <code>${html(field.value, 220)}</code>`
      ),
      `<b>Failed at:</b> <code>${message.timestamp}</code>`,
      '',
      `<b>Error</b>\n<pre>${html(message.error, 1400)}</pre>`,
    ].join('\n'),
    link_preview_options: { is_disabled: true },
    ...(buttons.length
      ? { reply_markup: { inline_keyboard: buttons.map((button) => [button]) } }
      : {}),
  };
}
