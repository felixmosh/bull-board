import { retryOnSlotMove } from '../src/retry';

const failing = (...messages: string[]) => {
  const operation = jest.fn(async () => 'done');
  for (const message of messages) operation.mockRejectedValueOnce(new Error(message));
  return operation;
};

describe('retryOnSlotMove', () => {
  it('retries TRYAGAIN until the operation succeeds', async () => {
    const operation = failing(
      'TRYAGAIN Multiple keys request during rehashing of slot',
      'TRYAGAIN Multiple keys request during rehashing of slot'
    );
    await expect(retryOnSlotMove(operation)).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it.each([
    'ASK 9575 127.0.0.1:7101',
    'MOVED 9575 127.0.0.1:7102',
    'ERR Script attempted to access a non local key in a cluster node script',
    'Too many Cluster redirections. Last error: ReplyError: ASK 9575 127.0.0.1:7101',
  ])('retries %s', async (message) => {
    const operation = failing(message);
    await expect(retryOnSlotMove(operation)).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws a non retryable error at once', async () => {
    const operation = failing('WRONGTYPE Operation against a key holding the wrong kind of value');
    await expect(retryOnSlotMove(operation)).rejects.toThrow('WRONGTYPE');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('gives up after three attempts', async () => {
    const operation = failing('TRYAGAIN one', 'TRYAGAIN two', 'TRYAGAIN three');
    await expect(retryOnSlotMove(operation)).rejects.toThrow('TRYAGAIN three');
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
