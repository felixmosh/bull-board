export interface FailedJobEvent {
  queue: string;
  prefix: string;
  jobId: string;
  reason: string;
  timestamp: number;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - 1;
  if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return `${text.slice(0, end)}…`;
}

export function formatFailure(appName: string, event: FailedJobEvent): string {
  return truncate(
    [
      `[${truncate(appName, 120)}] Job failed`,
      `Queue: ${truncate(event.prefix, 120)}:${truncate(event.queue, 200)}`,
      `Job ID: ${truncate(event.jobId, 200)}`,
      `Time: ${new Date(event.timestamp).toISOString()}`,
      `Error: ${truncate(event.reason || 'Unknown failure', 1100)}`,
    ].join('\n'),
    1900
  );
}
