import { Redis } from 'ioredis';
import { runScript } from '../src/scripts';
import { connection } from './connection';

describe('runScript', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis(connection);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await redis.quit();
  });

  const uncached = (body: string) => `${body} -- ${Math.random().toString(36).slice(2)}`;

  it('sends the script body only when Redis does not have it cached', async () => {
    const script = uncached('return ARGV[1] .. KEYS[1]');
    const evalSpy = jest.spyOn(redis, 'eval');
    const evalshaSpy = jest.spyOn(redis, 'evalsha');

    const first = await runScript(redis, script, 1, 'k', 'v');
    const second = await runScript(redis, script, 1, 'k', 'v');

    expect([first, second]).toEqual(['vk', 'vk']);
    expect(evalSpy).toHaveBeenCalledTimes(1);
    expect(evalshaSpy).toHaveBeenCalledTimes(2);
  });

  it('passes through a script error that is not a cache miss', async () => {
    const script = uncached("return redis.error_reply('boom')");
    await runScript(redis, script, 0).catch(() => undefined);
    const evalSpy = jest.spyOn(redis, 'eval');

    await expect(runScript(redis, script, 0)).rejects.toThrow('boom');
    expect(evalSpy).not.toHaveBeenCalled();
  });
});
