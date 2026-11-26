import type { Job, Queue } from 'bullmq';
import type { Cluster, Redis } from 'ioredis';
import { FieldDefinition, ResolvedField, resolveFields } from './fields';
import { DEFAULT_PREFIX, SearchKeys, searchKeys } from './keys';
import { INDEX_JOB_SCRIPT, PAGE_SCRIPT, REMOVE_JOB_SCRIPT } from './scripts';

export interface RedisSearchIndexOptions {
  connection: Redis | Cluster;
  queue: Queue;
  fields: Record<string, FieldDefinition>;
  prefix?: string;
}

export interface SearchPage {
  jobIds: string[];
  cursor?: string;
}

interface ScriptCommands {
  bbSearchIndexJob(...args: (string | number)[]): Promise<number>;
  bbSearchRemoveJob(...args: (string | number)[]): Promise<number>;
  bbSearchPage(...args: (string | number)[]): Promise<string[]>;
}

interface ScriptPipeline {
  bbSearchIndexJob(...args: (string | number)[]): unknown;
  bbSearchRemoveJob(...args: (string | number)[]): unknown;
}

function encodeCursor(score: string, jobId: string): string {
  return Buffer.from(`${score}:${jobId}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { score: string; jobId: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separator = decoded.indexOf(':');
  return { score: decoded.slice(0, separator), jobId: decoded.slice(separator + 1) };
}

export class RedisSearchIndex {
  readonly queue: Queue;
  readonly connection: Redis | Cluster;
  readonly keys: SearchKeys;
  readonly fieldNames: string[];
  private readonly fields: Map<string, ResolvedField>;

  constructor(options: RedisSearchIndexOptions) {
    this.queue = options.queue;
    this.connection = options.connection;
    this.keys = searchKeys(options.prefix ?? DEFAULT_PREFIX, options.queue.qualifiedName);
    const resolved = resolveFields(options.fields);
    this.fields = new Map(resolved.map((field) => [field.name, field]));
    this.fieldNames = resolved.map((field) => field.name);

    this.connection.defineCommand('bbSearchIndexJob', { lua: INDEX_JOB_SCRIPT });
    this.connection.defineCommand('bbSearchRemoveJob', { lua: REMOVE_JOB_SCRIPT });
    this.connection.defineCommand('bbSearchPage', { numberOfKeys: 1, lua: PAGE_SCRIPT });
  }

  field(name: string): ResolvedField | undefined {
    return this.fields.get(name);
  }

  async indexJobs(jobs: Job[]): Promise<void> {
    const indexable = jobs.filter((job) => job.id !== undefined);
    if (indexable.length === 0) return;

    const pipeline = this.connection.pipeline();
    for (const job of indexable) {
      this.queueIndex(pipeline as unknown as ScriptPipeline, job);
    }
    await this.settle(pipeline.exec());
  }

  async indexJob(job: Job): Promise<void> {
    await this.indexJobs([job]);
  }

  async removeJobs(jobIds: string[]): Promise<void> {
    if (jobIds.length === 0) return;

    const pipeline = this.connection.pipeline();
    for (const jobId of jobIds) {
      (pipeline as unknown as ScriptPipeline).bbSearchRemoveJob(
        2,
        this.keys.job(jobId),
        this.keys.all,
        jobId
      );
    }
    await this.settle(pipeline.exec());
  }

  async removeJob(jobId: string): Promise<void> {
    await this.removeJobs([jobId]);
  }

  async reindex(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await this.indexJob(job);
    } else {
      await this.removeJob(jobId);
    }
  }

  async known(jobIds: string[]): Promise<boolean[]> {
    if (jobIds.length === 0) return [];
    const scores = await this.connection.zmscore(this.keys.all, ...jobIds);
    return scores.map((score) => score !== null);
  }

  async page(
    field: string,
    value: string,
    cursor: string | undefined,
    limit: number
  ): Promise<SearchPage> {
    const resolved = this.fields.get(field);
    const key = this.keys.value(field, resolved ? resolved.normalize(value) : value);
    const commands = this.connection as unknown as ScriptCommands;

    let reply: string[];
    if (cursor) {
      const decoded = decodeCursor(cursor);
      reply = await commands.bbSearchPage(key, limit, decoded.score, decoded.jobId);
    } else {
      reply = await commands.bbSearchPage(key, limit);
    }

    const jobIds: string[] = [];
    const scores: string[] = [];
    for (let i = 0; i < reply.length; i += 2) {
      jobIds.push(reply[i]);
      scores.push(reply[i + 1]);
    }

    if (jobIds.length <= limit) return { jobIds };
    return {
      jobIds: jobIds.slice(0, limit),
      cursor: encodeCursor(scores[limit - 1], jobIds[limit - 1]),
    };
  }

  private queueIndex(pipeline: ScriptPipeline, job: Job): void {
    const jobId = job.id as string;
    const valueKeys: string[] = [];
    for (const field of this.fields.values()) {
      for (const value of field.values(job)) {
        valueKeys.push(this.keys.value(field.name, value));
      }
    }
    const keys = [this.keys.job(jobId), this.keys.all, ...new Set(valueKeys)];
    pipeline.bbSearchIndexJob(keys.length, ...keys, jobId, job.timestamp);
  }

  private async settle(execution: Promise<[Error | null, unknown][] | null>): Promise<void> {
    const results = await execution;
    for (const [error] of results ?? []) {
      if (error) throw error;
    }
  }
}
