import { act, renderHook } from '@testing-library/react';
import { useInterval } from '../../src/hooks/useInterval';
import { deferred } from '../testUtils';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const tick = (ms: number) => act(async () => void jest.advanceTimersByTime(ms));

it('runs the callback once on mount, before any tick', () => {
  const callback = jest.fn();

  renderHook(() => useInterval(callback, 1000));

  expect(callback).toHaveBeenCalledTimes(1);
});

it('runs it again on every tick', async () => {
  const callback = jest.fn();
  renderHook(() => useInterval(callback, 1000));

  await tick(1000);
  await tick(1000);
  await tick(1000);

  expect(callback).toHaveBeenCalledTimes(4);
});

it('runs once and never schedules when the delay is null', async () => {
  const callback = jest.fn();
  renderHook(() => useInterval(callback, null));

  await tick(10_000);

  expect(callback).toHaveBeenCalledTimes(1);
});

it('skips ticks while the previous call is still in flight', async () => {
  const inFlight = deferred<void>();
  const callback = jest
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockReturnValueOnce(inFlight.promise)
    .mockResolvedValue(undefined);

  renderHook(() => useInterval(callback, 1000));

  await tick(1000);
  expect(callback).toHaveBeenCalledTimes(2);

  await tick(3000);
  expect(callback).toHaveBeenCalledTimes(2);

  await act(async () => {
    inFlight.resolve();
    await inFlight.promise;
  });
  await tick(1000);

  expect(callback).toHaveBeenCalledTimes(3);
});

it('calls the latest callback without restarting the interval', async () => {
  const first = jest.fn();
  const second = jest.fn();
  const { rerender } = renderHook(({ callback }) => useInterval(callback, 1000), {
    initialProps: { callback: first },
  });

  await tick(500);
  rerender({ callback: second });
  await tick(500);

  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
});

it('restarts the interval when the delay changes', async () => {
  const callback = jest.fn();
  const { rerender } = renderHook(({ delay }) => useInterval(callback, delay), {
    initialProps: { delay: 1000 as number | null },
  });

  await tick(1000);
  expect(callback).toHaveBeenCalledTimes(2);

  rerender({ delay: 5000 });
  expect(callback).toHaveBeenCalledTimes(3);

  await tick(1000);
  expect(callback).toHaveBeenCalledTimes(3);

  await tick(4000);
  expect(callback).toHaveBeenCalledTimes(4);
});

it('stops ticking once unmounted', async () => {
  const callback = jest.fn();
  const { unmount } = renderHook(() => useInterval(callback, 1000));

  unmount();
  await tick(5000);

  expect(callback).toHaveBeenCalledTimes(1);
});
