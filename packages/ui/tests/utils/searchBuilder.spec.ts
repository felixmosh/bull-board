import type { AppJob } from '@bull-board/api/typings/app';
import {
  buildSearch,
  formatCondition,
  formatPath,
  formatValue,
  suggestFields,
} from '../../src/utils/searchBuilder';

describe('searchBuilder', () => {
  it('quotes path segments that are not plain identifiers', () => {
    expect(formatPath('data.payload.organizationId')).toBe('data.payload.organizationId');
    expect(formatPath('data.order id.x')).toBe('data.`order id`.x');
  });

  it('keeps numbers, booleans and null bare and quotes text', () => {
    expect(formatValue('77')).toBe('77');
    expect(formatValue('true')).toBe('true');
    expect(formatValue('paid')).toBe("'paid'");
    expect(formatValue("O'Neil")).toBe("'O\\'Neil'");
    expect(formatValue("'77'")).toBe("'77'");
  });

  it('writes each operator', () => {
    const f = (operator: any, value = '') => formatCondition({ field: 'data.x', operator, value });
    expect(f('=', '77')).toBe('data.x = 77');
    expect(f('!=', 'a')).toBe("data.x != 'a'");
    expect(f('ILIKE', '%@hoopay%')).toBe("data.x ILIKE '%@hoopay%'");
    expect(f('LIKE', '10%')).toBe("data.x LIKE '10%'");
    expect(f('CONTAINS', 'pix')).toBe("$icontains(data.x, 'pix')");
    expect(f('IN', 'paid, refunded, 3')).toBe("data.x IN ('paid', 'refunded', 3)");
    expect(f('NOT IN', 'a')).toBe("data.x NOT IN ('a')");
    expect(f('IS NULL')).toBe('data.x IS NULL');
    expect(f('IS NOT NULL')).toBe('data.x IS NOT NULL');
  });

  it('skips incomplete rows and joins the rest', () => {
    expect(
      buildSearch(
        [
          { field: 'name', operator: '=', value: 'webhook' },
          { field: '', operator: '=', value: 'x' },
          { field: 'data.amount', operator: '>=', value: '' },
          { field: 'data.amount', operator: '>=', value: '100' },
        ],
        'AND'
      )
    ).toBe("name = 'webhook' AND data.amount >= 100");
    expect(
      buildSearch(
        [
          { field: 'a', operator: '=', value: '1' },
          { field: 'b', operator: 'IS NULL', value: '' },
        ],
        'OR'
      )
    ).toBe('a = 1 OR b IS NULL');
  });

  it('suggests the leaf paths of the jobs data and return value', () => {
    const jobs = [
      {
        data: { payload: { organizationId: 1, tags: ['a'] }, items: [{ sku: 'x' }] },
        returnValue: { ok: true },
      },
      { data: { email: 'a@b.c' }, returnValue: null },
    ] as unknown as AppJob[];
    const fields = suggestFields(jobs);
    expect(fields.slice(0, 2)).toEqual(['name', 'id']);
    expect(fields).toEqual(
      expect.arrayContaining([
        'data.email',
        'data.items.sku',
        'data.payload.organizationId',
        'data.payload.tags',
        'returnvalue.ok',
      ])
    );
  });
});
