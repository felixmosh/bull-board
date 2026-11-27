import type { JobSearchProvider } from '@bull-board/api/typings/app';
import type { Queue } from 'bullmq';
import type { Cluster, Redis } from 'ioredis';
import { createRedisSearchProvider } from './createRedisSearchProvider';
import { FieldDefinition } from './fields';
import { RedisSearchIndex } from './RedisSearchIndex';
import { IndexerErrorContext, SearchIndexer, SearchIndexerOptions } from './SearchIndexer';

export interface RedisSearchIndexerOptions extends Omit<SearchIndexerOptions, 'onError'> {
  onError?: (error: Error, context: IndexerErrorContext & { queue: string }) => void;
}

export interface RedisSearchOptions {
  connection: Redis | Cluster;
  indexer?: RedisSearchIndexerOptions;
  fields?: Record<string, FieldDefinition>;
  prefix?: string;
}

interface Entry {
  index: RedisSearchIndex;
  indexer: SearchIndexer;
  retry?: NodeJS.Timeout;
}

const RETRY_START = 500;
const RETRY_CAP = 30000;

export class RedisSearch {
  private readonly entries = new Map<string, Entry>();
  private run = 0;
  private runs = 0;

  constructor(private readonly options: RedisSearchOptions) {}

  add(queue: Queue, options: { fields?: Record<string, FieldDefinition> } = {}): JobSearchProvider {
    if (this.entries.has(queue.qualifiedName)) {
      throw new Error(`Queue ${queue.qualifiedName} is already added to this RedisSearch`);
    }
    const index = new RedisSearchIndex({
      connection: this.options.connection,
      queue,
      fields: { ...this.options.fields, ...options.fields },
      prefix: this.options.prefix,
    });
    const queueName = queue.qualifiedName;
    const { onError, ...indexerOptions } = this.options.indexer ?? {};
    const indexer = new SearchIndexer(index, {
      ...indexerOptions,
      onError: onError && ((error, context) => onError(error, { queue: queueName, ...context })),
    });
    const entry: Entry = { index, indexer };
    this.entries.set(queueName, entry);
    if (this.run > 0) void this.launch(queueName, entry, this.run);
    return createRedisSearchProvider(index);
  }

  async start(): Promise<void> {
    if (this.run > 0) return;
    const run = ++this.runs;
    this.run = run;
    await Promise.all(
      [...this.entries].map(([queueName, entry]) => this.launch(queueName, entry, run))
    );
  }

  async stop(): Promise<void> {
    this.run = 0;
    for (const entry of this.entries.values()) clearTimeout(entry.retry);
    await Promise.all([...this.entries.values()].map(({ indexer }) => indexer.stop()));
  }

  async reindex(queue: Queue, jobIds: string[]): Promise<void> {
    await this.entry(queue).index.reindexJobs(jobIds);
  }

  async backfill(queue?: Queue): Promise<void> {
    const entries = queue ? [this.entry(queue)] : [...this.entries.values()];
    await Promise.all(entries.map((entry) => entry.indexer.backfill()));
  }

  index(queue: Queue): RedisSearchIndex {
    return this.entry(queue).index;
  }

  indexer(queue: Queue): SearchIndexer {
    return this.entry(queue).indexer;
  }

  private async launch(queueName: string, entry: Entry, run: number, delay = RETRY_START) {
    try {
      await entry.indexer.start();
    } catch (error) {
      if (this.run !== run) return;
      const failure = error instanceof Error ? error : new Error(String(error));
      this.options.indexer?.onError?.(failure, { queue: queueName });
      if (entry.indexer.listenerCount('error') > 0) entry.indexer.emit('error', failure);
      entry.retry = setTimeout(() => {
        if (this.run === run)
          void this.launch(queueName, entry, run, Math.min(delay * 2, RETRY_CAP));
      }, delay);
      entry.retry.unref();
    }
  }

  private entry(queue: Queue): Entry {
    const entry = this.entries.get(queue.qualifiedName);
    if (!entry) throw new Error(`Queue ${queue.qualifiedName} is not added to this RedisSearch`);
    return entry;
  }
}
