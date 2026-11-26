import type {
  JobSearchCoverage,
  JobSearchDiagnostics,
  JobSearchInspection,
  JobSearchProvider,
  JobSearchQuery,
  JobSearchResult,
  JobSearchStatus,
} from '@bull-board/api/typings/app';
import type { DemoJob, DemoQueue } from './state';

type FieldExtractor = (job: DemoJob) => unknown;

function toValues(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === '') return [];
  if (Array.isArray(raw)) return raw.flatMap(toValues);
  return [String(raw)];
}

function newestFirst(a: DemoJob, b: DemoJob): number {
  return b.timestamp - a.timestamp || Number(b.id) - Number(a.id);
}

export class MockSearchProvider implements JobSearchProvider {
  readonly diagnostics: JobSearchDiagnostics;

  constructor(
    private readonly queue: DemoQueue,
    private readonly fieldExtractors: Record<string, FieldExtractor>,
    private readonly options: { unindexed?: number } = {}
  ) {
    this.diagnostics = {
      status: () => this.status(),
      inspect: (jobId) => this.inspect(jobId),
      checkCoverage: ({ sample }) => this.checkCoverage(sample),
    };
  }

  async fields(): Promise<string[]> {
    return Object.keys(this.fieldExtractors);
  }

  async search({ field, value, status, cursor, limit }: JobSearchQuery): Promise<JobSearchResult> {
    const extract = this.fieldExtractors[field];
    if (!extract) return { jobIds: [] };

    const matches = this.indexedJobs()
      .filter((job) => !status || job.state === status)
      .filter((job) => toValues(extract(job)).includes(value))
      .map((job) => String(job.id));

    const offset = Number(cursor ?? 0) || 0;
    const end = offset + limit;
    return {
      jobIds: matches.slice(offset, end),
      ...(end < matches.length ? { cursor: String(end) } : {}),
    };
  }

  private sortedJobs(): DemoJob[] {
    return [...this.queue.jobs].sort(newestFirst);
  }

  private unindexedIds(): Set<string> {
    const count = this.options.unindexed ?? 0;
    return new Set(
      this.sortedJobs()
        .slice(0, count)
        .map((job) => String(job.id))
    );
  }

  private indexedJobs(): DemoJob[] {
    const unindexed = this.unindexedIds();
    return this.sortedJobs().filter((job) => !unindexed.has(String(job.id)));
  }

  private async status(): Promise<JobSearchStatus> {
    const now = Date.now();
    const pending = this.unindexedIds().size;
    const indexed = this.indexedJobs();

    return {
      health: pending > 0 ? 'degraded' : 'ok',
      reasons: pending > 0 ? ['PENDING_RETRIES'] : [],
      indexedJobs: indexed.length,
      indexerLastSeenAt: now - 2_000,
      lastEventAt: now - 7_000,
      pendingRetries: pending,
      lastBackfill: {
        finishedAt: now - 3 * 60 * 60 * 1000,
        jobs: indexed.length,
        durationMs: 180 + indexed.length * 3,
      },
      lastSweep: { finishedAt: now - 4 * 60 * 1000, checked: indexed.length, removed: 2 },
    };
  }

  private async inspect(jobId: string): Promise<JobSearchInspection> {
    const job = this.queue.jobs.find((entry) => String(entry.id) === String(jobId));
    const unindexed = this.unindexedIds().has(String(jobId));

    return {
      fields: Object.entries(this.fieldExtractors).map(([field, extract]) => {
        const values = job ? toValues(extract(job)) : [];
        return { field, values, indexed: !!job && !unindexed && values.length > 0 };
      }),
    };
  }

  private async checkCoverage(sample: number): Promise<JobSearchCoverage> {
    const unindexed = this.unindexedIds();
    const newest = this.sortedJobs()
      .slice(0, sample)
      .map((job) => String(job.id));

    return { checked: newest.length, missing: newest.filter((id) => unindexed.has(id)) };
  }
}
