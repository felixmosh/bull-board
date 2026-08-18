export function describeError(error: Error): string {
  if (error.message) return error.message;
  const causes = (error as { errors?: unknown }).errors;

  return Array.isArray(causes) && causes.length > 0
    ? causes.map((cause) => (cause as Error).message).join('; ')
    : String(error);
}
