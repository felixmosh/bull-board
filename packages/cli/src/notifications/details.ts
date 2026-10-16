import { truncate, type FailedJobEvent } from './format';

export interface FailureJob {
  name: string;
  attemptsMade: number;
  opts: { attempts?: number };
  processedOn?: number;
  finishedOn?: number;
}

const validNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function metadata(job: FailureJob | null | undefined): Partial<FailedJobEvent> {
  if (!job) return {};
  const result: Partial<FailedJobEvent> = {};
  if (typeof job.name === 'string') result.jobName = truncate(job.name, 220);
  if (validNumber(job.attemptsMade)) result.attemptsMade = job.attemptsMade;
  if (validNumber(job.opts.attempts ?? 1)) result.maxAttempts = job.opts.attempts || 1;
  if (
    validNumber(job.processedOn) &&
    validNumber(job.finishedOn) &&
    job.finishedOn >= job.processedOn
  )
    result.durationMs = job.finishedOn - job.processedOn;
  return result;
}

// Best-effort enrichment must neither delay alerts indefinitely nor grow a Redis read backlog.
export class FailureEnricher {
  private active = 0;
  private closing = false;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly maxConcurrent = 4,
    private readonly timeoutMs = 500
  ) {}

  notify(
    event: FailedJobEvent,
    readJob: () => Promise<FailureJob | null | undefined>,
    emit: (event: FailedJobEvent) => void
  ): void {
    if (this.closing) return;
    if (this.active >= this.maxConcurrent) {
      emit(event);
      return;
    }
    this.active++;
    let emitted = false;
    const finish = (details: Partial<FailedJobEvent> = {}) => {
      if (emitted) return;
      emitted = true;
      clearTimeout(timer);
      this.timers.delete(timer);
      if (!this.closing) emit({ ...event, ...details });
    };
    const timer = setTimeout(() => finish(), this.timeoutMs);
    this.timers.add(timer);
    let pending: Promise<FailureJob | null | undefined>;
    try {
      pending = readJob();
    } catch {
      pending = Promise.reject(new Error('Metadata unavailable'));
    }
    void pending
      .then(
        (job) => finish(metadata(job)),
        () => finish()
      )
      .finally(() => {
        this.active--;
      });
  }

  close(): void {
    this.closing = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }
}
