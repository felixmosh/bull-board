import type { FlowNode } from '@bull-board/api/typings/app';
import { mergeSubtrees } from '../../src/components/JobFlow/useFlowExpansion';

function makeNode(
  id: string,
  children: FlowNode[] = [],
  overrides: Partial<FlowNode> = {}
): FlowNode {
  return {
    id,
    name: `job-${id}`,
    state: 'waiting',
    progress: 0,
    queueName: 'q',
    children,
    ...overrides,
  };
}

describe('mergeSubtrees', () => {
  it('returns the tree unchanged when nothing is expanded', () => {
    const root = makeNode('1', [makeNode('2', [], { truncated: true })]);

    expect(mergeSubtrees(root, {})).toEqual(root);
  });

  it('replaces the children of an expanded node', () => {
    const root = makeNode('1', [makeNode('2', [], { truncated: true })]);
    const subtree = makeNode('2', [makeNode('3'), makeNode('4')]);

    const merged = mergeSubtrees(root, { 'q:2': subtree });

    expect(merged.children[0].children.map((c) => c.id)).toEqual(['3', '4']);
    expect(merged.children[0].truncated).toBeUndefined();
  });

  it('keeps the polled state of the expanded node rather than the subtree snapshot', () => {
    const root = makeNode('1', [makeNode('2', [], { truncated: true, state: 'active' })]);
    const subtree = makeNode('2', [makeNode('3')], { state: 'waiting' });

    const merged = mergeSubtrees(root, { 'q:2': subtree });

    expect(merged.children[0].state).toBe('active');
  });

  it('merges a subtree nested inside another subtree', () => {
    const root = makeNode('1', [makeNode('2', [], { truncated: true })]);
    const subtreeTwo = makeNode('2', [makeNode('3', [], { truncated: true })]);
    const subtreeThree = makeNode('3', [makeNode('4')]);

    const merged = mergeSubtrees(root, { 'q:2': subtreeTwo, 'q:3': subtreeThree });

    expect(merged.children[0].children[0].children.map((c) => c.id)).toEqual(['4']);
  });

  it('keeps children that were already loaded deeper than the subtree returns them', () => {
    const root = makeNode('1', [
      makeNode('2', [makeNode('2a')]),
      makeNode('3', [], { truncated: true }),
    ]);
    const subtree = makeNode('1', [
      makeNode('2', [], { truncated: true }),
      makeNode('3', [], { truncated: true }),
      makeNode('4', [], { truncated: true }),
    ]);

    const merged = mergeSubtrees(root, { 'q:1': subtree });

    expect(merged.children.map((c) => c.id)).toEqual(['2', '3', '4']);
    expect(merged.children[0].children.map((c) => c.id)).toEqual(['2a']);
    expect(merged.children[0].truncated).toBeUndefined();
    expect(merged.children[2].truncated).toBe(true);
  });

  it('keeps a subtree that is itself still truncated marked as truncated', () => {
    const root = makeNode('1', [makeNode('2', [], { truncated: true })]);
    const subtree = makeNode('2', [makeNode('3')], { truncated: true });

    const merged = mergeSubtrees(root, { 'q:2': subtree });

    expect(merged.children[0].truncated).toBe(true);
  });
});
