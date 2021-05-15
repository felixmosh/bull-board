import * as bullBoard from '../../src';

describe('lib public interface', () => {
  it('should save the interface', () => {
    expect(bullBoard).toMatchInlineSnapshot(`
      Object {
        "createBullBoard": [Function],
      }
    `);
  });
});
