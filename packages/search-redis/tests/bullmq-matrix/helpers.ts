export { connection } from '../connection';

export const EXPECTED_MAJOR: number = Number((globalThis as Record<string, any>).BULLMQ_MAJOR);

export function resolvedMajor(): number {
  const { version } = require('bullmq/package.json') as { version: string };
  return Number(version.split('.')[0]);
}

export function assertResolvedMajor(): void {
  it(`resolves bullmq@${EXPECTED_MAJOR} through the 'bullmq' specifier`, () => {
    expect(Number.isFinite(EXPECTED_MAJOR)).toBe(true);
    expect(resolvedMajor()).toBe(EXPECTED_MAJOR);
  });
}
