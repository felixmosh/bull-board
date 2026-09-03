import type { FlowNode } from '@bull-board/api/typings/app';
import { layoutFlow, nodeKey, shapeSignature } from '../../src/components/JobFlow/flowLayout';

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

const describeNode = (node: FlowNode) => `${node.name} ${node.state}`;

describe('layoutFlow', () => {
  it('places children to the right of their parent', () => {
    const root = makeNode('root', [makeNode('a'), makeNode('b')]);

    const { nodes } = layoutFlow(root, null, describeNode);

    const rootNode = nodes.find((n) => n.id === 'q:root')!;
    const a = nodes.find((n) => n.id === 'q:a')!;
    const b = nodes.find((n) => n.id === 'q:b')!;

    expect(a.position.x).toBeGreaterThan(rootNode.position.x);
    expect(b.position.x).toBe(a.position.x);
    expect(a.position.y).not.toBe(b.position.y);
  });

  it('emits one edge per parent link', () => {
    const root = makeNode('root', [makeNode('a', [makeNode('b')])]);

    const { edges } = layoutFlow(root, null, describeNode);

    expect(edges.map((e) => e.id).sort()).toEqual(['q:a->q:b', 'q:root->q:a']);
  });

  it('keys nodes by queue and id so two queues can share a job id', () => {
    const root = makeNode('1', [makeNode('1', [], { queueName: 'other' })]);

    const { nodes } = layoutFlow(root, null, describeNode);

    expect(nodes.map((n) => n.id).sort()).toEqual(['other:1', 'q:1']);
  });

  it('marks the selected node', () => {
    const root = makeNode('root', [makeNode('a')]);

    const { nodes } = layoutFlow(root, 'q:a', describeNode);

    expect(nodes.find((n) => n.id === 'q:a')!.data.isSelected).toBe(true);
    expect(nodes.find((n) => n.id === 'q:root')!.data.isSelected).toBe(false);
  });

  it('tells a node which queue its parent runs in, so a same-queue child can stay quiet', () => {
    const root = makeNode('root', [makeNode('a'), makeNode('b', [], { queueName: 'other' })]);

    const { nodes } = layoutFlow(root, null, describeNode);

    expect(nodes.find((n) => n.id === 'q:root')!.data.parentQueueName).toBeNull();
    expect(nodes.find((n) => n.id === 'q:a')!.data.parentQueueName).toBe('q');
    expect(nodes.find((n) => n.id === 'other:b')!.data.parentQueueName).toBe('q');
  });

  it('gives every node an accessible label', () => {
    const root = makeNode('root', [makeNode('a')]);

    const { nodes } = layoutFlow(root, null, describeNode);

    expect(nodes.find((n) => n.id === 'q:a')!.ariaLabel).toBe('job-a waiting');
  });

  it('centres a parent between its first and last child', () => {
    const root = makeNode('root', [makeNode('a'), makeNode('b'), makeNode('c')]);

    const { nodes } = layoutFlow(root, null, describeNode);
    const byId = new Map(nodes.map((n) => [n.id, n.position]));

    expect(byId.get('q:root')!.y).toBe((byId.get('q:a')!.y + byId.get('q:c')!.y) / 2);
    expect(byId.get('q:root')!.y).toBe(byId.get('q:b')!.y);
  });

  it('gives every node in an unbalanced tree its own position', () => {
    const root = makeNode('root', [
      makeNode('a', [makeNode('a1'), makeNode('a2', [makeNode('a2x')])]),
      makeNode('b'),
      makeNode('c', [makeNode('c1')]),
    ]);

    const { nodes } = layoutFlow(root, null, describeNode);
    const positions = nodes.map((n) => `${n.position.x},${n.position.y}`);

    expect(new Set(positions).size).toBe(nodes.length);
  });

  it('is deterministic across calls', () => {
    const root = makeNode('root', [makeNode('a'), makeNode('b', [makeNode('c')])]);

    expect(layoutFlow(root, null, describeNode).nodes).toEqual(
      layoutFlow(root, null, describeNode).nodes
    );
  });
});

describe('shapeSignature', () => {
  it('ignores state and progress changes', () => {
    const before = makeNode('root', [makeNode('a', [], { state: 'waiting', progress: 0 })]);
    const after = makeNode('root', [makeNode('a', [], { state: 'completed', progress: 100 })]);

    expect(shapeSignature(after)).toBe(shapeSignature(before));
  });

  it('changes when a child appears', () => {
    const before = makeNode('root', [makeNode('a')]);
    const after = makeNode('root', [makeNode('a'), makeNode('b')]);

    expect(shapeSignature(after)).not.toBe(shapeSignature(before));
  });

  it('changes when a truncated node is expanded', () => {
    const before = makeNode('root', [makeNode('a', [], { truncated: true })]);
    const after = makeNode('root', [makeNode('a', [makeNode('a1')])]);

    expect(shapeSignature(after)).not.toBe(shapeSignature(before));
  });
});

describe('nodeKey', () => {
  it('joins the queue name and the id', () => {
    expect(nodeKey({ id: '7', queueName: 'emails' })).toBe('emails:7');
  });
});
