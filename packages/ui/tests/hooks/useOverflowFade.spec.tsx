import { act, render } from '@testing-library/react';
import { useOverflowFade } from '../../src/hooks/useOverflowFade';

/* jsdom lays nothing out, so the scroll metrics the hook reads have to be supplied. */
function stubMetrics(element: HTMLElement, { scrollWidth = 500, clientWidth = 200 } = {}) {
  Object.defineProperty(element, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(element, 'clientWidth', { value: clientWidth, configurable: true });
}

let observed: (() => void) | undefined;

beforeAll(() => {
  // jsdom has no ResizeObserver, and the spec needs to fire it by hand anyway.
  global.ResizeObserver = class {
    constructor(callback: () => void) {
      observed = callback;
    }
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function Probe({ onEdges }: { onEdges: (edges: { start: boolean; end: boolean }) => void }) {
  const [ref, edges] = useOverflowFade<HTMLDivElement>();
  onEdges(edges);
  return <div ref={ref} data-testid="scroller" />;
}

function setup(metrics?: { scrollWidth?: number; clientWidth?: number }) {
  let edges = { start: false, end: false };
  const { getByTestId } = render(<Probe onEdges={(next) => (edges = next)} />);
  const element = getByTestId('scroller');
  stubMetrics(element, metrics);

  // The first pass measured an unstubbed element; re-measure now that it has metrics.
  act(() => observed?.());

  return { element, read: () => edges };
}

function scrollTo(element: HTMLElement, scrollLeft: number) {
  act(() => {
    element.scrollLeft = scrollLeft;
    element.dispatchEvent(new Event('scroll'));
  });
}

it('fades only the trailing edge at the start of the travel', () => {
  const { read } = setup();

  expect(read()).toEqual({ start: false, end: true });
});

it('fades both edges midway', () => {
  const { element, read } = setup();

  scrollTo(element, 150);

  expect(read()).toEqual({ start: true, end: true });
});

it('fades only the leading edge at the end of the travel', () => {
  const { element, read } = setup();

  scrollTo(element, 300);

  expect(read()).toEqual({ start: true, end: false });
});

/* Fractional layout leaves scrollLeft a hair short of either end. */
it('treats a sub-pixel gap as being at the end', () => {
  const { element, read } = setup();

  scrollTo(element, 299.4);

  expect(read()).toEqual({ start: true, end: false });
});

it('fades neither edge when everything fits', () => {
  const { read } = setup({ scrollWidth: 200, clientWidth: 200 });

  expect(read()).toEqual({ start: false, end: false });
});
