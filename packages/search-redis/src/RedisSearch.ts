import type { JobSearchProvider } from '@bull-board/api/typings/app';
import type { Queue } from 'bullmq';
import type { Cluster, Redis } from 'ioredis';
import { createRedisSearchProvider } from './createRedisSearchProvider';
import { FieldDefinition } from './fields';
import { RedisSearchIndex } from './RedisSearchIndex';
import { SearchIndexer, SearchIndexerOptions } from './SearchIndexer';

export interface RedisSearchIndexerOptions extends Omit<SearchIndexerOptions, 'onError'> {
  onError?: (error: Error, context: { queue: string; jobId?: string }) => void;
}

export interface RedisSearchOptions {
  connection: Redis | Cluster;
  indexer?: RedisSearchIndexerOptions;
  fields?: Record<string, FieldDefinition>;
  prefix?: string;
}

const NO_INDEXER = 'RedisSearch has no indexer options, pass indexer: { connection } to index';

interface Entry {
  index: RedisSearchIndex;
  indexer?: SearchIndexer;
}

export class RedisSearch {
  private readonly entries = new Map<string, Entry>();
  private started = false;

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
    let indexer: SearchIndexer | undefined;
    let onError: RedisSearchIndexerOptions['onError'];
    if (this.options.indexer) {
      const { onError: handler, ...indexerOptions } = this.options.indexer;
      onError = handler;
      indexer = new SearchIndexer(index, {
        ...indexerOptions,
        onError: handler && ((error, context) => handler(error, { queue: queueName, ...context })),
      });
    }
    this.entries.set(queueName, { index, indexer });
    if (this.started && indexer) {
      const started = indexer;
      started.start().catch((error) => {
        onError?.(error, { queue: queueName });
        if (started.listenerCount('error') > 0) started.emit('error', error);
      });
    }
    return createRedisSearchProvider(index);
  }

  async start(): Promise<void> {
    if (!this.options.indexer) throw new Error(NO_INDEXER);
    this.started = true;
    const results = await Promise.allSettled(
      [...this.entries.values()].map(({ indexer }) => indexer!.start())
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failure) {
      await this.stop();
      throw failure.reason;
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    await Promise.all([...this.entries.values()].map(({ indexer }) => indexer?.stop()));
  }

  async reindex(queue: Queue, jobIds: string[]): Promise<void> {
    await this.entry(queue).index.reindexJobs(jobIds);
  }

  async backfill(queue?: Queue): Promise<void> {
    const entries = queue ? [this.entry(queue)] : [...this.entries.values()];
    await Promise.all(entries.map((entry) => this.indexerOf(entry).backfill()));
  }

  index(queue: Queue): RedisSearchIndex {
    return this.entry(queue).index;
  }

  indexer(queue: Queue): SearchIndexer {
    return this.indexerOf(this.entry(queue));
  }

  private indexerOf(entry: Entry): SearchIndexer {
    if (!entry.indexer) throw new Error(NO_INDEXER);
    return entry.indexer;
  }

  private entry(queue: Queue): Entry {
    const entry = this.entries.get(queue.qualifiedName);
    if (!entry) throw new Error(`Queue ${queue.qualifiedName} is not added to this RedisSearch`);
    return entry;
  }
}
