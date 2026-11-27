import { EventEmitter } from 'events';
import { ConnectionOptions, Job, QueueEvents } from 'bullmq';
import { BackfillResult, backfillQueue } from './backfill';
import { HEARTBEAT_EVERY, HEARTBEAT_TTL } from './keys';
import { RedisSearchIndex } from './RedisSearchIndex';
import { ADVANCE_CHECKPOINT_SCRIPT } from './scripts';
import { compareStreamIds, streamIdTime } from './streamId';
import { QueueClient, SweepResult, queueClient, sweepOnce } from './sweep';

export interface IndexerErrorContext {
  jobIds?: string[];
}

export interface SearchIndexerOptions {
  connection?: ConnectionOptions;
  startTimeout?: number;
  backfillOnStart?: boolean;
  backfillBatchSize?: number;
  sweepEvery?: number | false;
  sweepIdleEvery?: number;
  sweepBatch?: number;
  maxRetries?: number;
  onError?: (error: Error, context: IndexerErrorContext) => void;
}

type Operation = 'index' | 'remove' | 'check';

interface Pending {
  operation: Operation;
  eventId: string;
}

interface CheckpointCommands {
  bbSearchAdvanceCheckpoint(key: string, eventId: string): Promise<number>;
}

interface FeedConnection {
  _client?: { disconnect(): void };
}

interface Disconnectable {
  disconnect(): void;
}

interface DuplicableClient extends Disconnectable {
  isCluster?: boolean;
  options: { redisOptions?: Record<string, unknown> };
  duplicate(...args: unknown[]): Disconnectable;
}

const EVENT_BATCH = 1000;
const RETRY_BACKOFF = 100;
const BACKOFF_START = 500;
const BACKOFF_CAP = 30000;

const CHECKED_EVENTS = [
  'active',
  'completed',
  'debounced',
  'deduplicated',
  'delayed',
  'duplicated',
  'failed',
  'progress',
  'retries-exhausted',
  'stalled',
  'waiting',
  'waiting-children',
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const asError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

function feedConnection(connection: ConnectionOptions | undefined): {
  connection: ConnectionOptions | undefined;
  owned?: Disconnectable;
} {
  const client = connection as unknown as DuplicableClient | undefined;
  if (typeof client?.duplicate !== 'function') {
    return {
      connection:
        connection && ({ ...connection, maxRetriesPerRequest: null } as ConnectionOptions),
    };
  }
  const owned = client.isCluster
    ? client.duplicate([], {
        redisOptions: { ...client.options.redisOptions, maxRetriesPerRequest: null },
      })
    : client.duplicate({ maxRetriesPerRequest: null });
  return { connection: owned as unknown as ConnectionOptions, owned };
}

function abandon(events: QueueEvents, owned?: Disconnectable): void {
  const internals = events as unknown as {
    connection?: FeedConnection;
    backend?: { connection?: FeedConnection; blockingConnection?: FeedConnection };
  };
  for (const connection of [
    internals.connection,
    internals.backend?.connection,
    internals.backend?.blockingConnection,
  ]) {
    connection?._client?.disconnect();
  }
  owned?.disconnect();
  events.close().catch(() => undefined);
}

export class SearchIndexer extends EventEmitter {
  readonly backfillOnStart: boolean;
  readonly backfillBatchSize: number;
  readonly sweepEvery: number | false;
  readonly sweepIdleEvery: number;
  readonly sweepBatch: number;
  private readonly maxRetries: number;
  private readonly startTimeout: number;
  private readonly buffer = new Map<string, Pending>();
  private generation = 0;
  private running = false;
  private halt = new AbortController();
  private readonly starting = new Set<AbortController>();
  private events?: QueueEvents;
  private feedClient?: Disconnectable;
  private writeFailing = false;
  private feedBackoff = BACKOFF_START;
  private feedSettling?: NodeJS.Timeout;
  private reopenTimer?: NodeJS.Timeout;
  private heartbeatRetry?: NodeJS.Timeout;
  private draining?: Promise<void>;
  private lifecycle: Promise<void> = Promise.resolve();
  private heartbeat?: NodeJS.Timeout;
  private sweepTimer?: NodeJS.Timeout;
  private sweeping?: Promise<void>;
  private sweepClient?: Promise<QueueClient>;
  private passRemoved = 0;
  private betweenPasses = false;
  private backfilling?: Promise<void>;
  private backfillAbort?: AbortController;
  private backfills = 0;

  constructor(
    private readonly index: RedisSearchIndex,
    private readonly options: SearchIndexerOptions = {}
  ) {
    super();
    this.backfillOnStart = options.backfillOnStart ?? true;
    this.backfillBatchSize = options.backfillBatchSize ?? 500;
    this.sweepEvery = options.sweepEvery ?? 5000;
    this.sweepIdleEvery = options.sweepIdleEvery ?? 60000;
    this.sweepBatch = options.sweepBatch ?? 5000;
    this.maxRetries = options.maxRetries ?? 3;
    this.startTimeout = options.startTimeout ?? 30000;
    index.onExtractError = (error, jobId) => this.report(error, { jobIds: [jobId] });
    index.connection.defineCommand('bbSearchAdvanceCheckpoint', {
      numberOfKeys: 1,
      lua: ADVANCE_CHECKPOINT_SCRIPT,
    });
  }

  start(): Promise<void> {
    const halt = new AbortController();
    this.starting.add(halt);
    return this.enqueue(() => this.open(halt)).finally(() => this.starting.delete(halt));
  }

  stop(): Promise<void> {
    this.halt.abort();
    for (const halt of this.starting) halt.abort();
    return this.enqueue(() => this.teardown());
  }

  backfill(): Promise<BackfillResult> {
    return this.runBackfill();
  }

  async sweep(): Promise<{ checked: number; removed: number }> {
    const { checked, removed } = await this.runSweep();
    return { checked, removed };
  }

  private enqueue(step: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(step);
    this.lifecycle = next.catch(() => undefined);
    return next;
  }

  private async open(controller: AbortController): Promise<void> {
    if (this.running || controller.signal.aborted) return;
    const generation = ++this.generation;
    this.running = true;
    this.halt = controller;
    this.feedBackoff = BACKOFF_START;
    this.passRemoved = 0;
    this.betweenPasses = false;
    clearTimeout(this.heartbeatRetry);
    const halt = controller.signal;

    try {
      const { connection, keys } = this.index;
      const reset = connection.multi().hdel(keys.stats, 'writeFailingSince', 'writeFailingJobs');
      if (this.backfills === 0) reset.hset(keys.stats, 'backfillRunning', '0');
      await this.settle(reset.exec());
      this.writeFailing = false;
      await this.drainRetrySet();
      await this.openFeed(generation);
      if (this.backfillOnStart) this.startBackfill();
      if (this.sweepEvery !== false) this.scheduleSweep(generation, this.sweepEvery);
    } catch (error) {
      const stopped = halt.aborted;
      await this.teardown().catch((teardownError) => this.report(asError(teardownError), {}));
      if (stopped) return;
      throw error;
    }
  }

  private async openFeed(generation: number): Promise<void> {
    const { connection, keys, queue } = this.index;
    const from = (await connection.get(keys.checkpoint)) ?? '0';
    const feed = feedConnection(this.options.connection ?? queue.opts.connection);
    let events: QueueEvents;
    try {
      events = new QueueEvents(queue.name, {
        connection: feed.connection as ConnectionOptions,
        prefix: queue.opts.prefix,
        lastEventId: from,
        autorun: false,
      });
    } catch (error) {
      feed.owned?.disconnect();
      throw error;
    }
    events.on('error', (error: Error) => this.report(error, {}));
    const push = (jobId: string | undefined, operation: Operation, id: string) => {
      if (this.events === events) this.push(generation, jobId, operation, id);
    };
    events.on('added', ({ jobId }: { jobId: string }, id: string) => push(jobId, 'index', id));
    events.on('removed', ({ jobId }: { jobId: string }, id: string) => push(jobId, 'remove', id));
    for (const name of CHECKED_EVENTS) {
      (events as EventEmitter).on(name, (args: Record<string, string>, id: string) => {
        push(args.jobId, 'check', id);
        if (name === 'deduplicated') push(args.deduplicatedJobId, 'check', id);
      });
    }

    try {
      await this.ready(events);
      if (generation !== this.generation) throw new Error('SearchIndexer was stopped');
      clearTimeout(this.heartbeatRetry);
      await this.beat();
      await connection.hset(keys.stats, 'startedAt', String(Date.now()));
    } catch (error) {
      abandon(events, feed.owned);
      throw error;
    }

    this.events = events;
    this.feedClient = feed.owned;
    clearTimeout(this.feedSettling);
    this.feedSettling = setTimeout(() => {
      if (this.events === events) this.feedBackoff = BACKOFF_START;
    }, HEARTBEAT_EVERY);
    this.feedSettling.unref();
    this.heartbeat = setInterval(() => void this.beat(), HEARTBEAT_EVERY);
    this.heartbeat.unref();
    events.run().then(
      () => this.feedEnded(events, generation, new Error('The event feed stopped')),
      (error) => this.feedEnded(events, generation, asError(error))
    );
  }

  private ready(events: QueueEvents): Promise<void> {
    const signal = this.halt.signal;
    return new Promise((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', aborted);
        if (error) reject(error);
        else resolve();
      };
      const aborted = () => finish(new Error('SearchIndexer was stopped'));
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              `The event feed of ${this.index.queue.name} was not ready within ${this.startTimeout} ms`
            )
          ),
        this.startTimeout
      );
      if (signal.aborted) return aborted();
      signal.addEventListener('abort', aborted);
      events.waitUntilReady().then(
        () => finish(),
        (error) => finish(asError(error))
      );
    });
  }

  private feedEnded(events: QueueEvents, generation: number, error: Error): void {
    if (events !== this.events || generation !== this.generation) return;
    this.events = undefined;
    clearInterval(this.heartbeat);
    clearTimeout(this.feedSettling);
    abandon(events, this.feedClient);
    this.feedClient = undefined;
    this.report(error, {});
    void this.dropHeartbeat();
    this.scheduleReopen(generation);
  }

  private scheduleReopen(generation: number): void {
    const delay = this.feedBackoff;
    this.feedBackoff = Math.min(delay * 2, BACKOFF_CAP);
    clearTimeout(this.reopenTimer);
    this.reopenTimer = setTimeout(() => {
      void this.enqueue(async () => {
        if (generation !== this.generation || this.events) return;
        try {
          await this.openFeed(generation);
        } catch (error) {
          if (generation !== this.generation || this.halt.signal.aborted) return;
          this.report(asError(error), {});
          this.scheduleReopen(generation);
        }
      });
    }, delay);
  }

  private async teardown(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.generation++;
    this.halt.abort();
    clearInterval(this.heartbeat);
    clearTimeout(this.sweepTimer);
    clearTimeout(this.reopenTimer);
    clearTimeout(this.feedSettling);
    this.backfillAbort?.abort();
    this.buffer.clear();
    const events = this.events;
    const feedClient = this.feedClient;
    this.events = undefined;
    this.feedClient = undefined;

    try {
      await events?.close();
    } finally {
      feedClient?.disconnect();
    }
    await this.draining;
    await this.sweeping;
    await this.backfilling;
    await this.dropHeartbeat();
  }

  private async dropHeartbeat(delay = BACKOFF_START): Promise<void> {
    try {
      await this.index.connection.del(this.index.keys.heartbeat);
    } catch (error) {
      this.report(asError(error), {});
      clearTimeout(this.heartbeatRetry);
      this.heartbeatRetry = setTimeout(() => {
        if (!this.events) void this.dropHeartbeat(Math.min(delay * 2, BACKOFF_CAP));
      }, delay);
      this.heartbeatRetry.unref();
    }
  }

  private startBackfill(): void {
    const abort = new AbortController();
    this.backfillAbort = abort;
    this.backfilling = this.runBackfill(abort.signal).then(
      () => undefined,
      (error) => this.raise(asError(error))
    );
  }

  private async runBackfill(signal?: AbortSignal): Promise<BackfillResult> {
    const { connection, keys } = this.index;
    this.backfills++;
    let result: BackfillResult;
    try {
      await connection.hset(keys.stats, 'backfillRunning', '1');
      result = await backfillQueue(this.index, this.backfillBatchSize, signal);
    } catch (error) {
      await this.backfillEnded();
      throw error;
    }
    if (signal?.aborted) {
      await this.backfillEnded();
      return result;
    }
    await this.backfillEnded({
      backfillFinishedAt: String(Date.now()),
      backfillJobs: String(result.jobs),
      backfillDurationMs: String(result.durationMs),
    });
    this.emit('backfilled', result);
    return result;
  }

  private async backfillEnded(stats: Record<string, string> = {}): Promise<void> {
    this.backfills--;
    const running = this.backfills > 0 ? {} : { backfillRunning: '0' };
    const fields = { ...stats, ...running };
    if (Object.keys(fields).length > 0) {
      await this.index.connection.hset(this.index.keys.stats, fields);
    }
  }

  private scheduleSweep(generation: number, delay: number): void {
    this.sweepTimer = setTimeout(() => {
      if (generation !== this.generation) return;
      this.sweeping = this.runSweep().then(
        ({ dense }) => this.afterSweep(generation, dense),
        (error) => {
          this.betweenPasses = false;
          this.raise(asError(error));
          this.afterSweep(generation, false);
        }
      );
    }, delay);
    this.sweepTimer.unref();
  }

  private afterSweep(generation: number, dense: boolean): void {
    this.sweeping = undefined;
    if (generation === this.generation && this.sweepEvery !== false) {
      const delay = this.betweenPasses ? this.sweepIdleEvery : this.sweepEvery;
      this.scheduleSweep(generation, dense ? 0 : delay);
    }
  }

  private async runSweep(): Promise<SweepResult> {
    await this.drainRetrySet();
    this.sweepClient ??= queueClient(this.index.queue);
    const result = await sweepOnce(this.index, await this.sweepClient, this.sweepBatch);
    this.passRemoved += result.removed;
    this.betweenPasses = result.wrapped && this.passRemoved === 0;
    if (result.wrapped) this.passRemoved = 0;
    await this.index.connection.hset(this.index.keys.stats, {
      sweepFinishedAt: String(Date.now()),
      sweepChecked: String(result.checked),
      sweepRemoved: String(result.removed),
    });
    this.emit('swept', { checked: result.checked, removed: result.removed });
    return result;
  }

  private push(
    generation: number,
    jobId: string | undefined,
    operation: Operation,
    eventId: string
  ) {
    if (generation !== this.generation || !jobId) return;
    const pending = this.buffer.get(jobId);
    const kept = operation === 'check' && pending ? pending.operation : operation;
    this.buffer.delete(jobId);
    this.buffer.set(jobId, { operation: kept, eventId });
    this.schedule();
  }

  private schedule(): void {
    if (this.draining || this.buffer.size === 0) return;
    const generation = this.generation;
    this.draining = this.drain(generation)
      .catch((error) => this.report(asError(error), {}))
      .finally(() => {
        this.draining = undefined;
        if (generation === this.generation) this.schedule();
      });
  }

  private async drain(generation: number): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    let backoff = BACKOFF_START;
    let parkFailed = false;
    while (generation === this.generation && this.buffer.size > 0) {
      const batch: [string, Pending][] = [];
      for (const entry of this.buffer) {
        batch.push(entry);
        if (batch.length === EVENT_BATCH) break;
      }
      for (const [jobId] of batch) this.buffer.delete(jobId);

      let lastEventId = batch[0][1].eventId;
      for (const [, { eventId }] of batch) {
        if (compareStreamIds(eventId, lastEventId) > 0) lastEventId = eventId;
      }

      let written: [string[], string[]] = [[], []];
      try {
        written = await this.handle(batch);
      } catch (error) {
        const jobIds = batch.map(([jobId]) => jobId);
        try {
          await this.index.connection.sadd(this.index.keys.retry, ...jobIds);
        } catch (parkError) {
          if (!parkFailed) this.report(asError(parkError), { jobIds });
          parkFailed = true;
          this.restore(batch);
          await this.recordWriteFailing();
          await this.pause(backoff);
          if (this.halt.signal.aborted) return;
          backoff = Math.min(backoff * 2, BACKOFF_CAP);
          continue;
        }
        this.report(asError(error), { jobIds });
      }
      parkFailed = false;
      backoff = BACKOFF_START;
      if (this.writeFailing) await this.clearWriteFailing();

      try {
        await this.commit(lastEventId);
      } catch (error) {
        this.report(asError(error), {});
      }
      this.announce(...written);
    }
  }

  private restore(batch: [string, Pending][]): void {
    const newer = new Map(this.buffer);
    const older = new Map(batch);
    this.buffer.clear();
    for (const [jobId, pending] of batch) {
      if (!newer.has(jobId)) this.buffer.set(jobId, pending);
    }
    for (const [jobId, pending] of newer) {
      const kept = pending.operation === 'check' ? older.get(jobId)?.operation : undefined;
      this.buffer.set(jobId, { operation: kept ?? pending.operation, eventId: pending.eventId });
    }
  }

  private async recordWriteFailing(): Promise<void> {
    const { connection, keys } = this.index;
    try {
      if (!this.writeFailing) {
        await connection.hsetnx(keys.stats, 'writeFailingSince', String(Date.now()));
        this.writeFailing = true;
      }
      await connection.hset(keys.stats, 'writeFailingJobs', String(this.buffer.size));
    } catch {
      return;
    }
  }

  private async clearWriteFailing(): Promise<void> {
    try {
      await this.index.connection.hdel(
        this.index.keys.stats,
        'writeFailingSince',
        'writeFailingJobs'
      );
      this.writeFailing = false;
    } catch (error) {
      this.report(asError(error), {});
    }
  }

  private async settle(execution: Promise<[Error | null, unknown][] | null>): Promise<void> {
    for (const [error] of (await execution) ?? []) {
      if (error) throw error;
    }
  }

  private pause(ms: number): Promise<void> {
    const signal = this.halt.signal;
    return new Promise((resolve) => {
      if (signal.aborted) return resolve();
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener('abort', done);
    });
  }

  private async handle(batch: [string, Pending][]): Promise<[string[], string[]]> {
    const checked = batch.filter(([, pending]) => pending.operation === 'check');
    const toRemove = batch
      .filter(([, pending]) => pending.operation === 'remove')
      .map(([jobId]) => jobId);

    for (let attempt = 0; ; attempt++) {
      try {
        const known = await this.index.known(checked.map(([jobId]) => jobId));
        const toRead = batch
          .filter(([, pending]) => pending.operation === 'index')
          .map(([jobId]) => jobId)
          .concat(checked.filter((_, i) => !known[i]).map(([jobId]) => jobId));
        const jobs = (
          await Promise.all(toRead.map((jobId) => this.index.queue.getJob(jobId)))
        ).filter((job): job is Job => Boolean(job));

        await this.index.indexJobs(jobs);
        await this.index.removeJobs(toRemove);
        return [jobs.map((job) => job.id as string), toRemove];
      } catch (error) {
        if (attempt >= this.maxRetries) throw error;
        await sleep(RETRY_BACKOFF * (attempt + 1));
      }
    }
  }

  private async drainRetrySet(): Promise<void> {
    const { connection, keys, queue } = this.index;
    let jobIds: string[];
    try {
      jobIds = await connection.smembers(keys.retry);
    } catch (error) {
      this.report(asError(error), {});
      return;
    }
    for (let i = 0; i < jobIds.length; i += EVENT_BATCH) {
      const chunk = jobIds.slice(i, i + EVENT_BATCH);
      try {
        const jobs = await Promise.all(chunk.map((jobId) => queue.getJob(jobId)));
        const found = jobs.filter((job): job is Job => Boolean(job));
        const missing = chunk.filter((_, j) => !jobs[j]);
        await this.index.indexJobs(found);
        await this.index.removeJobs(missing);
        const back = (await Promise.all(missing.map((jobId) => queue.getJob(jobId)))).filter(
          (job): job is Job => Boolean(job)
        );
        await this.index.indexJobs(back);
        await connection.srem(keys.retry, ...chunk);
        const returned = new Set(back.map((job) => job.id as string));
        this.announce(
          [...found, ...back].map((job) => job.id as string),
          missing.filter((jobId) => !returned.has(jobId))
        );
      } catch (error) {
        this.report(asError(error), { jobIds: chunk });
      }
    }
  }

  private async commit(eventId: string): Promise<void> {
    const { connection, keys } = this.index;
    await (connection as unknown as CheckpointCommands).bbSearchAdvanceCheckpoint(
      keys.checkpoint,
      eventId
    );
    await connection.hset(keys.stats, 'lastEventAt', String(streamIdTime(eventId)));
  }

  private async beat(): Promise<void> {
    try {
      await this.index.connection.set(
        this.index.keys.heartbeat,
        String(Date.now()),
        'PX',
        HEARTBEAT_TTL
      );
    } catch (error) {
      this.report(asError(error), {});
    }
  }

  private announce(indexed: string[], removed: string[]): void {
    for (const [event, jobIds] of [
      ['indexed', indexed],
      ['removed', removed],
    ] as const) {
      if (jobIds.length === 0) continue;
      try {
        this.emit(event, jobIds);
      } catch (error) {
        this.report(asError(error), {});
      }
    }
  }

  private report(error: Error, context: IndexerErrorContext): void {
    try {
      this.options.onError?.(error, context);
    } catch {
      return;
    }
  }

  private raise(error: Error): void {
    this.report(error, {});
    process.nextTick(() => {
      if (this.listenerCount('error') > 0) this.emit('error', error);
    });
  }
}
