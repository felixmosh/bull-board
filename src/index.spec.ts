import * as bullBoard from './index'

describe('index', () => {
  it('should save the interface', () => {
    expect(bullBoard).toMatchInlineSnapshot(`
      Object {
        "router": [Function],
        "setQueues": [Function],
      }
    `)
  })
})
