import type { NotificationConfig } from './config';
import { formatFailure, type FailedJobEvent, type FailureMessage } from './format';
import { sendNotification, type Channel } from './providers';

interface Delivery {
  channel: Channel;
  message: FailureMessage;
  attempts: number;
  nextAt: number;
  expiresAt: number;
}

// Notifications are best-effort and intentionally keep no durable job history.
const MAX_AGE_MS = 30 * 60 * 1000;

export class NotificationService {
  private readonly pending = new Set<Delivery>();
  private readonly active = new Map<
    Channel,
    { controller: AbortController; done: Promise<void> }
  >();
  private readonly blockedUntil: Record<Channel, number> = { discord: 0, telegram: 0 };
  private readonly warningAt = new Map<string, number>();
  private readonly timer: NodeJS.Timeout;
  private closing = false;
  private closed?: Promise<void>;

  constructor(
    private readonly config: NotificationConfig,
    private readonly onWarning: (message: string) => void,
    private readonly fetcher: typeof fetch = fetch
  ) {
    this.timer = setInterval(() => this.pump(), 25);
    this.timer.unref();
  }

  public get pendingCount(): number {
    return this.pending.size;
  }

  public notify(event: FailedJobEvent): void {
    if (this.closing) return;
    const message = formatFailure(this.config.appName, event, this.config.boardUrl);
    const now = Date.now();
    for (const channel of ['discord', 'telegram'] as const) {
      if (!this.config[channel]) continue;
      if (this.pending.size >= this.config.maxPending) {
        this.warn('capacity', 'Notification capacity reached; dropping new deliveries.');
        continue;
      }
      this.pending.add({ channel, message, attempts: 0, nextAt: now, expiresAt: now + MAX_AGE_MS });
    }
  }

  private warn(key: string, message: string): void {
    const now = Date.now();
    if (now - (this.warningAt.get(key) ?? -Infinity) < 60000) return;
    this.warningAt.set(key, now);
    this.onWarning(message);
  }

  private pump(): void {
    if (this.closing) return;
    const now = Date.now();
    for (const item of this.pending) {
      if (now >= item.expiresAt) {
        if (!this.active.has(item.channel)) this.pending.delete(item);
        continue;
      }
      if (
        this.active.has(item.channel) ||
        now < item.nextAt ||
        now < this.blockedUntil[item.channel]
      )
        continue;
      const controller = new AbortController();
      // Defer run() so the slot is reserved before even a synchronous rejection can finish.
      const done = Promise.resolve().then(() => this.run(item, controller));
      this.active.set(item.channel, { controller, done });
    }
  }

  private async run(item: Delivery, controller: AbortController): Promise<void> {
    item.attempts++;
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const result = await sendNotification(
        this.config,
        item.channel,
        item.message,
        controller.signal,
        this.fetcher
      );
      const now = Date.now();
      if (result.kind === 'retryable' && result.code === 'HTTP_429') {
        this.blockedUntil[item.channel] = now + (result.retryAfterMs ?? this.config.retryDelayMs);
      }
      if (this.closing || result.kind === 'sent') {
        this.pending.delete(item);
      } else if (result.kind === 'permanent' || item.attempts >= this.config.maxAttempts) {
        this.pending.delete(item);
        this.warn(item.channel, `Notification ${item.channel} delivery failed (${result.code}).`);
      } else {
        const delay = Math.max(
          Math.min(60000, this.config.retryDelayMs * 2 ** (item.attempts - 1)),
          result.retryAfterMs ?? 0
        );
        item.nextAt = now + delay;
        if (item.nextAt >= item.expiresAt) {
          this.pending.delete(item);
          this.warn(
            item.channel,
            `Notification ${item.channel} delivery expired (${result.code}).`
          );
        }
      }
    } finally {
      clearTimeout(timeout);
      this.active.delete(item.channel);
    }
  }

  public close(): Promise<void> {
    if (this.closed) return this.closed;
    this.closing = true;
    clearInterval(this.timer);
    for (const { controller } of this.active.values()) controller.abort();
    this.closed = Promise.allSettled([...this.active.values()].map(({ done }) => done)).then(() => {
      this.pending.clear();
      this.active.clear();
      this.warningAt.clear();
    });
    return this.closed;
  }
}
