import { EventEmitter } from 'events';
import { ConnectionOptions, Job, QueueEvents } from 'bullmq';
import { RedisSearchIndex } from './RedisSearchIndex';
import { ADVANCE_CHECKPOINT_SCRIPT } from './scripts';
import { compareStreamIds, streamIdTime } from './streamId';

export interface SearchIndexerOptions {
  connection: ConnectionOptions;
  backfillOnStart?: boolean;
  backfillBatchSize?: number;
  sweepEvery?: number | false;
  sweepBatch?: number;
  maxRetries?: number;
  onError?: (error: Error, context: { jobId?: string }) => void;
}

type Operation = 'index' | 'remove' | 'check';

interface Pending {
  operation: Operation;
  eventId: string;
}

interface CheckpointCommands {
  bbSearchAdvanceCheckpoint(key: string, eventId: string): Promise<number>;
}

const EVENT_BATCH = 1000;
const HEARTBEAT_EVERY = 5000;
const HEARTBEAT_TTL = 30000;
const RETRY_BACKOFF = 100;

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

export class SearchIndexer extends EventEmitter {
  readonly backfillOnStart: boolean;
  readonly backfillBatchSize: number;
  readonly sweepEvery: number | false;
  readonly sweepBatch: number;
  private readonly maxRetries: number;
  private readonly buffer = new Map<string, Pending>();
  private generation = 0;
  private running = false;
  private events?: QueueEvents;
  private draining?: Promise<void>;
  private stopping?: Promise<void>;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly index: RedisSearchIndex,
    private readonly options: SearchIndexerOptions
  ) {
    super();
    this.backfillOnStart = options.backfillOnStart ?? true;
    this.backfillBatchSize = options.backfillBatchSize ?? 500;
    this.sweepEvery = options.sweepEvery ?? 5000;
    this.sweepBatch = options.sweepBatch ?? 1000;
    this.maxRetries = options.maxRetries ?? 3;
    index.connection.defineCommand('bbSearchAdvanceCheckpoint', {
      numberOfKeys: 1,
      lua: ADVANCE_CHECKPOINT_SCRIPT,
    });
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.stopping;

    const { connection, keys, queue } = this.index;
    const checkpoint = await connection.get(keys.checkpoint);
    await this.drainRetrySet();

    const generation = ++this.generation;
    this.running = true;
    this.stopping = undefined;

    await connection.hset(keys.stats, 'startedAt', String(Date.now()));
    await this.beat();
    this.heartbeat = setInterval(() => void this.beat(), HEARTBEAT_EVERY);
    this.heartbeat.unref();

    const events = new QueueEvents(queue.name, {
      connection: this.options.connection,
      prefix: queue.opts.prefix,
      lastEventId: checkpoint ?? '0',
    });
    this.events = events;
    events.on('error', (error: Error) => this.report(error, {}));
    events.on('added', ({ jobId }: { jobId: string }, id: string) =>
      this.push(generation, jobId, 'index', id)
    );
    events.on('removed', ({ jobId }: { jobId: string }, id: string) =>
      this.push(generation, jobId, 'remove', id)
    );
    for (const name of CHECKED_EVENTS) {
      (events as EventEmitter).on(name, (args: Record<string, string>, id: string) => {
        this.push(generation, args.jobId, 'check', id);
        if (name === 'deduplicated') this.push(generation, args.deduplicatedJobId, 'check', id);
      });
    }
    await events.waitUntilReady();
  }

  stop(): Promise<void> {
    if (!this.running) return this.stopping ?? Promise.resolve();
    this.running = false;
    this.generation++;
    clearInterval(this.heartbeat);
    this.buffer.clear();
    const events = this.events;
    this.events = undefined;

    this.stopping = (async () => {
      await events?.close();
      await this.draining;
      await this.index.connection.del(this.index.keys.heartbeat);
    })();
    return this.stopping;
  }

  private push(
    generation: number,
    jobId: string | undefined,
    operation: Operation,
    eventId: string
  ) {
    if (generation !== this.generation || !jobId) return;
    this.buffer.delete(jobId);
    this.buffer.set(jobId, { operation, eventId });
    this.schedule();
  }

  private schedule(): void {
    if (this.draining || this.buffer.size === 0) return;
    const generation = this.generation;
    this.draining = this.drain(generation).finally(() => {
      this.draining = undefined;
      if (generation === this.generation) this.schedule();
    });
  }

  private async drain(generation: number): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
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
        } catch (fatal) {
          this.fail(asError(fatal));
          return;
        }
        for (const jobId of jobIds) this.report(asError(error), { jobId });
      }

      try {
        await this.commit(lastEventId);
      } catch (error) {
        this.report(asError(error), {});
      }
      this.announce(...written);
    }
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
    const jobIds = await connection.smembers(keys.retry);
    for (let i = 0; i < jobIds.length; i += EVENT_BATCH) {
      const chunk = jobIds.slice(i, i + EVENT_BATCH);
      const jobs = await Promise.all(chunk.map((jobId) => queue.getJob(jobId)));
      const found = jobs.filter((job): job is Job => Boolean(job));
      const missing = chunk.filter((_, j) => !jobs[j]);
      await this.index.indexJobs(found);
      await this.index.removeJobs(missing);
      await connection.srem(keys.retry, ...chunk);
      this.announce(
        found.map((job) => job.id as string),
        missing
      );
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
    if (indexed.length > 0) this.emit('indexed', indexed);
    if (removed.length > 0) this.emit('removed', removed);
  }

  private report(error: Error, context: { jobId?: string }): void {
    this.options.onError?.(error, context);
  }

  private fail(error: Error): void {
    void this.stop();
    process.nextTick(() => this.emit('error', error));
  }
}
