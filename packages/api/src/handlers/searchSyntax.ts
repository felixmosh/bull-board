/**
 * SQL flavoured operators on top of JSONata, so a search can be written the way people query a
 * database: `data.email ILIKE '%@hoopay.com.br' AND data.amount >= 100`.
 *
 * The rewrite runs on the source text with every string literal, regex literal and backtick
 * quoted field name masked out first, so a keyword inside one of them is never touched. What is
 * left is plain JSONata, plus the helper functions registered by `registerSearchFunctions`.
 *
 * | Written                        | Becomes                              |
 * |--------------------------------|--------------------------------------|
 * | `a LIKE 'x%'`                  | `$like(a, 'x%')`                     |
 * | `a NOT ILIKE 'x%'`             | `$not($ilike(a, 'x%'))`              |
 * | `a IS NULL` / `a IS NOT NULL`  | `$isNull(a)` / `$not($isNull(a))`    |
 * | `a IN ('x', 'y')`              | `a in ['x', 'y']`                    |
 * | `a NOT IN ['x', 'y']`          | `$not(a in ['x', 'y'])`              |
 * | `AND` / `OR` / `NOT (...)`     | `and` / `or` / `$not(...)`           |
 * | `<>` / `==`                    | `!=` / `=`                           |
 */

const STRING_MARK = '\u0000';
const NAME_MARK = '\u0001';

interface Masked {
  text: string;
  literals: string[];
}

// A `/` opens a regex where JSONata expects an operand, which is after one of these or at the start.
const REGEX_CAN_FOLLOW = /(^|[([{,:;=!<>~&|+\-*%?]|\band|\bor|\bin)\s*$/;

function mask(source: string): Masked {
  const literals: string[] = [];
  let text = '';
  let i = 0;

  const take = (end: number, mark: string) => {
    literals.push(source.slice(i, end));
    text += `${mark}${literals.length - 1}${mark}`;
    i = end;
  };

  while (i < source.length) {
    const char = source[i];

    if (char === '"' || char === "'") {
      let end = i + 1;
      while (end < source.length && source[end] !== char) {
        end += source[end] === '\\' ? 2 : 1;
      }
      take(Math.min(end + 1, source.length), STRING_MARK);
      continue;
    }

    if (char === '`') {
      const close = source.indexOf('`', i + 1);
      take(close === -1 ? source.length : close + 1, NAME_MARK);
      continue;
    }

    if (char === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      take(close === -1 ? source.length : close + 2, STRING_MARK);
      continue;
    }

    if (char === '/' && REGEX_CAN_FOLLOW.test(text)) {
      let end = i + 1;
      while (end < source.length && source[end] !== '/') {
        end += source[end] === '\\' ? 2 : 1;
      }
      end += 1;
      while (end < source.length && /[a-z]/i.test(source[end])) end += 1;
      take(Math.min(end, source.length), STRING_MARK);
      continue;
    }

    text += char;
    i += 1;
  }

  return { text, literals };
}

function unmask({ text, literals }: Masked): string {
  // The control characters are the placeholders `mask` wrote, which never occur in typed input.
  // oxlint-disable-next-line no-control-regex
  return text.replace(/[\u0000\u0001](\d+)[\u0000\u0001]/g, (_, index) => literals[Number(index)]);
}

const SEGMENT = String.raw`(?:\$?[A-Za-z_][\w$]*|\u0001\d+\u0001)`;
const PATH = String.raw`(${SEGMENT}(?:\s*\.\s*${SEGMENT}|\[[^\[\]]*\])*)`;
const STRING = String.raw`(\u0000\d+\u0000)`;
const LIST = String.raw`(\[[^\[\]]*\]|\([^()]*\))`;

const toArray = (list: string) => (list.startsWith('(') ? `[${list.slice(1, -1)}]` : list);

const REWRITES: [RegExp, (...groups: string[]) => string][] = [
  [
    new RegExp(String.raw`${PATH}\s+(NOT\s+)?(I?LIKE)\s+${STRING}`, 'gi'),
    (_, path, not, op, pattern) => {
      const call = `$${op.toLowerCase()}(${path}, ${pattern})`;
      return not ? `$not(${call})` : call;
    },
  ],
  [
    new RegExp(String.raw`${PATH}\s+IS\s+(NOT\s+)?NULL\b`, 'gi'),
    (_, path, not) => (not ? `$not($isNull(${path}))` : `$isNull(${path})`),
  ],
  [
    new RegExp(String.raw`${PATH}\s+NOT\s+IN\s*${LIST}`, 'gi'),
    (_, path, list) => `$not(${path} in ${toArray(list)})`,
  ],
  [new RegExp(String.raw`\bIN\s*${LIST}`, 'gi'), (_, list) => `in ${toArray(list)}`],
  [/\bNOT\s*\(/g, () => '$not('],
  [/\bAND\b/g, () => 'and'],
  [/\bOR\b/g, () => 'or'],
  [/<>/g, () => '!='],
  [/==/g, () => '='],
];

export function rewriteSearch(source: string): string {
  const masked = mask(source);
  let text = masked.text;
  for (const [pattern, replace] of REWRITES) {
    text = text.replace(pattern, replace as (substring: string, ...args: any[]) => string);
  }
  return unmask({ text, literals: masked.literals });
}

function likeToRegExp(pattern: string, flags: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '\\' && i + 1 < pattern.length) {
      i += 1;
      source += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (char === '%') {
      source += '[\\s\\S]*';
    } else if (char === '_') {
      source += '[\\s\\S]';
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`, flags);
}

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/** A path that runs over an array yields an array, and matches when any element does, as in SQL `ANY`. */
function anyScalar(value: unknown, test: (text: string) => boolean): boolean {
  if (Array.isArray(value)) return value.some((item) => anyScalar(item, test));
  return isScalar(value) && test(String(value));
}

const patternCache = new Map<string, RegExp>();

function like(value: unknown, pattern: unknown, flags: string): boolean {
  if (typeof pattern !== 'string') return false;
  const cacheKey = `${flags}:${pattern}`;
  let regex = patternCache.get(cacheKey);
  if (!regex) {
    regex = likeToRegExp(pattern, flags);
    if (patternCache.size > 500) patternCache.clear();
    patternCache.set(cacheKey, regex);
  }
  return anyScalar(value, (text) => regex.test(text));
}

export const searchFunctions: Record<string, (...args: any[]) => unknown> = {
  /** `%` is any run of characters and `_` exactly one, case sensitive. `\%` and `\_` are literal. */
  like: (value: unknown, pattern: unknown) => like(value, pattern, ''),
  /** `$like` ignoring case. */
  ilike: (value: unknown, pattern: unknown) => like(value, pattern, 'i'),
  /** Substring match ignoring case, the shortcut for `ILIKE '%text%'`. */
  icontains: (value: unknown, text: unknown) =>
    isScalar(text) &&
    anyScalar(value, (candidate) => candidate.toLowerCase().includes(String(text).toLowerCase())),
  /** True for a missing field and for an explicit `null`, as SQL `IS NULL` reads both. */
  isNull: (value: unknown) => value === undefined || value === null,
};

export function registerSearchFunctions(expression: {
  registerFunction: (name: string, implementation: (...args: any[]) => unknown) => void;
}): void {
  for (const [name, implementation] of Object.entries(searchFunctions)) {
    expression.registerFunction(name, implementation);
  }
}
