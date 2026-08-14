/**
 * `error.message` is usually the whole story, but Node's own `net.connect` wraps a failed
 * dual-stack attempt (Happy Eyeballs, on by default since Node 20) in an `AggregateError`
 * whose own `.message` is empty; the real causes live in `.errors`. That combination is not
 * exotic: it is exactly what "redis://localhost:..." hits when nothing is listening, since
 * `localhost` resolves to both `::1` and `127.0.0.1` and both attempts get refused.
 */
export function describeError(error: Error): string {
  if (error.message) return error.message;
  const causes = (error as { errors?: unknown }).errors;

  return Array.isArray(causes) && causes.length > 0
    ? causes.map((cause) => (cause as Error).message).join('; ')
    : String(error);
}
