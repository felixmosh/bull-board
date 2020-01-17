const queues = require('./queues')

jest.mock('./getDataForQueues', () => async () => '👋🏽 getDataForQueues')

describe('queues', () => {
  const mockRequest = { app: { locals: { queues: jest.fn() } }, query: '' }
  const mockResponse = { json: jest.fn() }

  beforeEach(() => {
    mockResponse.json.mockClear()
  })

  it('should work', async () => {
    const result = await queues(mockRequest, mockResponse)

    expect(result).toEqual(undefined)
    expect(mockResponse.json).toHaveBeenCalledWith('👋🏽 getDataForQueues')
  })
})
