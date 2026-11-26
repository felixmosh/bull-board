import { createHash } from 'crypto';

export const DEFAULT_PREFIX = 'bull-board-search';
export const HEARTBEAT_EVERY = 5000;
export const HEARTBEAT_TTL = 30000;

export interface SearchKeys {
  value(field: string, value: string): string;
  job(jobId: string): string;
  all: string;
  retry: string;
  checkpoint: string;
  sweep: string;
  heartbeat: string;
  stats: string;
}

const sha1 = (input: string) => createHash('sha1').update(input).digest('hex');

export function searchKeys(prefix: string, qualifiedName: string): SearchKeys {
  const base = `${prefix}:{${sha1(qualifiedName).slice(0, 16)}}`;

  return {
    value: (field, value) => `${base}:f:${field}:${sha1(value)}`,
    job: (jobId) => `${base}:j:${jobId}`,
    all: `${base}:all`,
    retry: `${base}:retry`,
    checkpoint: `${base}:checkpoint`,
    sweep: `${base}:sweep`,
    heartbeat: `${base}:heartbeat`,
    stats: `${base}:stats`,
  };
}
