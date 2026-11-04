import type { AppJob } from '@bull-board/api/typings/app';

/**
 * The visual search builder: rows of field / operator / value, joined by AND or OR, written out
 * as the same search text a user would type (`data.email ILIKE '%@x' AND data.amount > 10`), so
 * the result stays visible and editable in the search field.
 */

export const BUILDER_OPERATORS = [
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'LIKE',
  'ILIKE',
  'NOT ILIKE',
  'CONTAINS',
  'IN',
  'NOT IN',
  'IS NULL',
  'IS NOT NULL',
] as const;

export type BuilderOperator = (typeof BUILDER_OPERATORS)[number];

export type BuilderJoin = 'AND' | 'OR';

export interface BuilderCondition {
  field: string;
  operator: BuilderOperator;
  value: string;
}

/** Operators that take no value. */
export const operatorTakesValue = (operator: BuilderOperator) =>
  operator !== 'IS NULL' && operator !== 'IS NOT NULL';

/** Operators whose value is a comma separated list. */
export const operatorTakesList = (operator: BuilderOperator) =>
  operator === 'IN' || operator === 'NOT IN';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const NUMBER = /^-?\d+(\.\d+)?$/;

/** `data.order id.x` -> data.`order id`.x, so any key the job data has can be addressed. */
export function formatPath(field: string): string {
  return field
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => (IDENTIFIER.test(segment) ? segment : `\`${segment.replace(/`/g, '')}\``))
    .join('.');
}

const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/**
 * A typed value as a literal: numbers, true, false and null stay bare so `= 77` compares with a
 * number. Wrapping it in quotes ('77') forces text.
 */
export function formatValue(raw: string): string {
  const value = raw.trim();
  if (/^'.*'$|^".*"$/.test(value)) return value;
  if (NUMBER.test(value) || value === 'true' || value === 'false' || value === 'null') {
    return value;
  }
  return quote(value);
}

const formatList = (raw: string) =>
  `(${raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(formatValue)
    .join(', ')})`;

/** One condition as search text, or undefined while it is still incomplete. */
export function formatCondition({ field, operator, value }: BuilderCondition): string | undefined {
  const path = formatPath(field);
  if (!path) return undefined;
  if (!operatorTakesValue(operator)) return `${path} ${operator}`;
  if (!value.trim()) return undefined;

  switch (operator) {
    case 'LIKE':
    case 'ILIKE':
    case 'NOT ILIKE':
      // A pattern is always text, even one that looks like a number.
      return `${path} ${operator} ${quote(value.trim())}`;
    case 'CONTAINS':
      return `$icontains(${path}, ${quote(value.trim())})`;
    case 'IN':
    case 'NOT IN':
      return `${path} ${operator} ${formatList(value)}`;
    default:
      return `${path} ${operator} ${formatValue(value)}`;
  }
}

export function buildSearch(conditions: BuilderCondition[], join: BuilderJoin): string {
  // One join for every row, so no condition needs parentheses around it.
  return conditions
    .map(formatCondition)
    .filter((part): part is string => !!part)
    .join(` ${join} `);
}

/** Fields every job has, in the names the search reads them by (`job.toJSON()`). */
export const BASE_FIELDS = [
  'name',
  'id',
  'attemptsMade',
  'failedReason',
  'timestamp',
  'processedOn',
  'finishedOn',
];

const MAX_DEPTH = 5;
const MAX_FIELDS = 300;

function collectPaths(value: unknown, prefix: string, depth: number, into: Set<string>) {
  if (into.size >= MAX_FIELDS) return;
  if (Array.isArray(value)) {
    // A path through an array reads every element, so the keys of the elements are offered.
    value.slice(0, 5).forEach((item) => collectPaths(item, prefix, depth, into));
    if (!value.some((item) => item && typeof item === 'object')) into.add(prefix);
    return;
  }
  if (value && typeof value === 'object' && depth < MAX_DEPTH) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) into.add(prefix);
    for (const [key, child] of entries) {
      collectPaths(child, `${prefix}.${key}`, depth + 1, into);
    }
    return;
  }
  into.add(prefix);
}

/** Field suggestions: the base fields, then every leaf path in the data and return value of `jobs`. */
export function suggestFields(jobs: AppJob[]): string[] {
  const paths = new Set<string>();
  for (const job of jobs) {
    collectPaths(job.data, 'data', 0, paths);
    if (job.returnValue !== undefined && job.returnValue !== null) {
      collectPaths(job.returnValue, 'returnvalue', 0, paths);
    }
  }
  return [...BASE_FIELDS, ...[...paths].sort()];
}

/** One field of a sample job, ready to become a condition. */
export interface SampleField {
  path: string;
  value: unknown;
  /** The path runs through an array, so it reads several values at once. */
  inArray: boolean;
}

function collectSample(
  value: unknown,
  path: string,
  inArray: boolean,
  depth: number,
  into: SampleField[]
) {
  if (into.length >= MAX_FIELDS) return;
  if (Array.isArray(value)) {
    // The first element stands for the rest: a path through an array reads every element.
    if (value.length > 0) collectSample(value[0], path, true, depth, into);
    return;
  }
  if (value && typeof value === 'object') {
    if (depth >= MAX_DEPTH) return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectSample(child, `${path}.${key}`, inArray, depth + 1, into);
    }
    return;
  }
  into.push({ path, value, inArray });
}

/** Every leaf of a job's name, data and return value, with the value that job holds there. */
export function sampleFields(job: AppJob): SampleField[] {
  const fields: SampleField[] = [{ path: 'name', value: job.name, inArray: false }];
  collectSample(job.data, 'data', false, 0, fields);
  if (job.returnValue !== undefined && job.returnValue !== null) {
    collectSample(job.returnValue, 'returnvalue', false, 0, fields);
  }
  return fields;
}

/**
 * The condition a sample field starts as: equal to the value the sample job holds. Text that
 * reads like a number or a keyword is quoted so it is still compared as text, a null becomes
 * IS NULL, and a path through an array uses LIKE, which matches when any element equals it.
 */
export function conditionFromSample({ path, value, inArray }: SampleField): BuilderCondition {
  if (value === null || value === undefined) {
    return { field: path, operator: 'IS NULL', value: '' };
  }
  const text =
    typeof value === 'string' && formatValue(value) !== quote(value) ? `'${value}'` : String(value);
  if (inArray) {
    // No wildcards: the sample value matched exactly, with its own % and _ escaped.
    return { field: path, operator: 'LIKE', value: String(value).replace(/[\\%_]/g, '\\$&') };
  }
  return { field: path, operator: '=', value: text };
}
