export interface NotificationConfig {
  appName: string;
  boardUrl?: string;
  timeoutMs: number;
  maxAttempts: number;
  retryDelayMs: number;
  maxPending: number;
  discord: { webhookUrl: string; threadId?: string } | null;
  telegram: { botToken: string; chatId: string; messageThreadId?: number } | null;
}

const key = (suffix: string) => `BULL_BOARD_${suffix}`;

export function resolveNotifications(env: NodeJS.ProcessEnv): NotificationConfig | null {
  function enabled(suffix: string): boolean {
    const value = env[key(suffix)]?.trim().toLowerCase();
    if (value === undefined || value === '' || value === 'false' || value === '0') return false;
    if (value === 'true' || value === '1') return true;
    throw new Error(`${key(suffix)} must be true, false, 1 or 0.`);
  }
  function required(suffix: string): string {
    const value = env[key(suffix)]?.trim();
    if (!value) throw new Error(`${key(suffix)} is required.`);
    return value;
  }
  function integer(suffix: string, fallback: number, min: number, max: number): number {
    const raw = env[key(suffix)];
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${key(suffix)} must be an integer between ${min} and ${max}.`);
    }
    return value;
  }
  function id(suffix: string): string | undefined {
    const value = env[key(suffix)]?.trim();
    if (!value) return undefined;
    if (!/^[1-9]\d{0,24}$/.test(value)) throw new Error(`${key(suffix)} must be a positive ID.`);
    return value;
  }

  if (!enabled('NOTIFICATIONS_ENABLED')) return null;
  let discord: NotificationConfig['discord'] = null;
  let telegram: NotificationConfig['telegram'] = null;
  if (enabled('DISCORD_ENABLED')) {
    const webhookUrl = required('DISCORD_WEBHOOK_URL');
    let valid = false;
    try {
      const url = new URL(webhookUrl);
      valid =
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        ['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com'].includes(
          url.hostname
        ) &&
        /^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) &&
        !url.hash;
    } catch {
      /* Report only the variable name, never its secret value. */
    }
    if (!valid) throw new Error('BULL_BOARD_DISCORD_WEBHOOK_URL must be a Discord HTTPS webhook.');
    const threadId = id('DISCORD_THREAD_ID');
    discord = { webhookUrl, ...(threadId ? { threadId } : {}) };
  }
  if (enabled('TELEGRAM_ENABLED')) {
    const botToken = required('TELEGRAM_BOT_TOKEN');
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken))
      throw new Error('BULL_BOARD_TELEGRAM_BOT_TOKEN is invalid.');
    const chatId = required('TELEGRAM_CHAT_ID');
    if (!/^-?[1-9]\d{0,24}$/.test(chatId) && !/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(chatId)) {
      throw new Error('BULL_BOARD_TELEGRAM_CHAT_ID must be a chat ID or @channel username.');
    }
    const threadId = id('TELEGRAM_MESSAGE_THREAD_ID');
    if (threadId && !Number.isSafeInteger(Number(threadId))) {
      throw new Error('BULL_BOARD_TELEGRAM_MESSAGE_THREAD_ID must be a safe integer.');
    }
    telegram = { botToken, chatId, ...(threadId ? { messageThreadId: Number(threadId) } : {}) };
  }
  if (!discord && !telegram)
    throw new Error('BULL_BOARD_NOTIFICATIONS_ENABLED needs at least one enabled channel.');
  const appName = env.BULL_BOARD_NOTIFICATION_APP_NAME?.trim() || 'bull-board';
  if (appName.length > 120)
    throw new Error('BULL_BOARD_NOTIFICATION_APP_NAME must be at most 120 characters.');
  let boardUrl: string | undefined;
  const rawBoardUrl = env.BULL_BOARD_NOTIFICATION_BOARD_URL?.trim();
  if (rawBoardUrl) {
    try {
      const url = new URL(rawBoardUrl);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password ||
        rawBoardUrl.includes('?') ||
        rawBoardUrl.includes('#') ||
        url.href.length > 1024
      )
        throw new Error('Invalid public URL');
      boardUrl = url.href.replace(/\/+$/, '');
    } catch {
      throw new Error(
        'BULL_BOARD_NOTIFICATION_BOARD_URL must be an HTTP(S) dashboard URL without credentials, query or fragment (max 1024 characters).'
      );
    }
  }
  return {
    appName,
    ...(boardUrl ? { boardUrl } : {}),
    discord,
    telegram,
    timeoutMs: integer('NOTIFICATION_TIMEOUT_MS', 10000, 100, 60000),
    maxAttempts: integer('NOTIFICATION_MAX_ATTEMPTS', 3, 1, 10),
    retryDelayMs: integer('NOTIFICATION_RETRY_DELAY_MS', 1000, 10, 60000),
    maxPending: integer('NOTIFICATION_MAX_PENDING', 200, 1, 10000),
  };
}
