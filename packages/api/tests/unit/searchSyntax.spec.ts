import jsonata from 'jsonata';
import { registerSearchFunctions, rewriteSearch } from '../../src/handlers/searchSyntax';

const run = async (search: string, input: unknown) => {
  const expression = jsonata(rewriteSearch(search));
  registerSearchFunctions(expression);
  return expression.evaluate(input);
};

describe('search syntax', () => {
  it.each([
    [`data.email LIKE '%@hoopay.com.br'`, `$like(data.email, '%@hoopay.com.br')`],
    [`data.email not ilike "a%"`, `$not($ilike(data.email, "a%"))`],
    [`data.coupon IS NULL`, `$isNull(data.coupon)`],
    [`data.coupon is not null`, `$not($isNull(data.coupon))`],
    [`data.status IN ('paid', 'refunded')`, `data.status in ['paid', 'refunded']`],
    [`data.status NOT IN ['paid']`, `$not(data.status in ['paid'])`],
    [`a = 1 AND b = 2 OR NOT (c = 3)`, `a = 1 and b = 2 or $not(c = 3)`],
    [`a <> 1 and b == 2`, `a != 1 and b = 2`],
    [`data.\`order id\` LIKE '1%'`, `$like(data.\`order id\`, '1%')`],
    [`data.items[sku = 'A'].name LIKE 'x%'`, `$like(data.items[sku = 'A'].name, 'x%')`],
  ])('rewrites %s', (source, expected) => {
    expect(rewriteSearch(source)).toBe(expected);
  });

  it('leaves keywords inside strings, regexes and quoted names alone', () => {
    for (const source of [
      `name = 'A AND B LIKE "x"'`,
      `$contains(name, /AND|OR/)`,
      `data.\`IS NULL\` = 1`,
    ]) {
      expect(rewriteSearch(source)).toBe(source);
    }
  });

  it('matches LIKE patterns with % and _, case sensitive', async () => {
    const job = { data: { email: 'Ana@HooPay.com.br', doc: '123.456' } };
    expect(await run(`data.email LIKE '%@HooPay.com.br'`, job)).toBe(true);
    expect(await run(`data.email LIKE '%@hoopay.com.br'`, job)).toBe(false);
    expect(await run(`data.email ILIKE '%@hoopay.com.br'`, job)).toBe(true);
    expect(await run(`data.doc LIKE '123_456'`, job)).toBe(true);
    // `\\_` in the JSONata string is a literal underscore, so the `.` no longer matches.
    expect(await run(String.raw`data.doc LIKE '123\\_456'`, job)).toBe(false);
    expect(await run(String.raw`data.v LIKE '50\\%'`, { data: { v: '50%' } })).toBe(true);
    expect(await run(`data.email NOT ILIKE 'ana%'`, job)).toBe(false);
  });

  it('treats special regex characters in a LIKE pattern literally', async () => {
    expect(await run(`data.v LIKE 'a.c'`, { data: { v: 'abc' } })).toBe(false);
    expect(await run(`data.v LIKE '(x)%'`, { data: { v: '(x)+1' } })).toBe(true);
  });

  it('compares numbers as text and matches when any array element does', async () => {
    const job = { data: { amount: 1050, tags: ['pix', 'boleto'] } };
    expect(await run(`data.amount LIKE '10%'`, job)).toBe(true);
    expect(await run(`data.tags LIKE 'bol%'`, job)).toBe(true);
    expect(await run(`data.missing LIKE '%'`, job)).toBe(false);
  });

  it('reads a missing field and an explicit null as NULL', async () => {
    const job = { data: { coupon: null, code: 'X' } };
    expect(await run(`data.coupon IS NULL`, job)).toBe(true);
    expect(await run(`data.absent IS NULL`, job)).toBe(true);
    expect(await run(`data.code IS NULL`, job)).toBe(false);
    expect(await run(`data.code IS NOT NULL`, job)).toBe(true);
  });

  it('supports IN lists and combines with AND/OR', async () => {
    const job = { name: 'webhook', data: { status: 'paid', amount: 10 } };
    expect(await run(`data.status IN ('paid', 'refunded') AND data.amount > 5`, job)).toBe(true);
    expect(await run(`data.status NOT IN ('paid') OR name = 'email'`, job)).toBe(false);
    expect(await run(`$icontains(name, 'HOOK')`, job)).toBe(true);
  });
});
