import type { FlowNode } from '@bull-board/api/typings/app';

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 124;

const COLUMN_STRIDE = NODE_WIDTH + 90;
const ROW_STRIDE = NODE_HEIGHT + 20;

export interface FlowJobNodeData {
  node: FlowNode;
  isSelected: boolean;
  parentQueueName: string | null;
}

export interface FlowGraphNode {
  id: string;
  type: 'jobNode';
  position: { x: number; y: number };
  width: number;
  height: number;
  ariaLabel: string;
  data: FlowJobNodeData;
}

export interface FlowGraphEdge {
  id: string;
  source: string;
  target: string;
}

export function nodeKey(node: Pick<FlowNode, 'id' | 'queueName'>): string {
  return `${node.queueName}:${node.id}`;
}

export function layoutFlow(
  root: FlowNode,
  selectedKey: string | null,
  describe: (node: FlowNode) => string
): { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] } {
  const nodes: FlowGraphNode[] = [];
  const edges: FlowGraphEdge[] = [];
  let nextLeafRow = 0;

  const place = (node: FlowNode, depth: number, parentQueueName: string | null): number => {
    const id = nodeKey(node);
    let row: number;

    if (node.children.length === 0) {
      row = nextLeafRow;
      nextLeafRow += 1;
    } else {
      const childRows = node.children.map((child) => {
        const childRow = place(child, depth + 1, node.queueName);
        const target = nodeKey(child);
        edges.push({ id: `${id}->${target}`, source: id, target });
        return childRow;
      });
      row = (childRows[0] + childRows[childRows.length - 1]) / 2;
    }

    nodes.push({
      id,
      type: 'jobNode',
      position: { x: depth * COLUMN_STRIDE, y: row * ROW_STRIDE },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      ariaLabel: describe(node),
      data: { node, isSelected: id === selectedKey, parentQueueName },
    });

    return row;
  };

  place(root, 0, null);

  return { nodes, edges };
}

export function shapeSignature(root: FlowNode): string {
  const parts: string[] = [];

  const walk = (node: FlowNode, parent: string) => {
    const key = nodeKey(node);
    parts.push(`${parent}>${key}${node.truncated ? '+' : ''}`);
    node.children.forEach((child) => walk(child, key));
  };

  walk(root, '');

  return parts.join('|');
}
