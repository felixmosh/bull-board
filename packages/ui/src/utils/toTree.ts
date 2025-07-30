import type { AppQueue } from '@bull-board/api/typings/app';

export interface AppQueueTreeNode {
  name: string;
  prefix: string;
  queue?: AppQueue;
  children: AppQueueTreeNode[];
}

export type QueueSortKey = 'alphabetical' | keyof AppQueue['counts'];
export type SortDirection = 'asc' | 'desc';

export function toTree(queues: AppQueue[]): AppQueueTreeNode {
  const root: AppQueueTreeNode = {
    name: 'root',
    prefix: '',
    children: [],
  };

  queues.forEach((queue) => {
    if (!queue.delimiter) {
      // If no delimiter, add as direct child to root
      root.children.push({
        name: queue.name,
        prefix: queue.name,
        queue,
        children: [],
      });
      return;
    }

    const nameToSplit =
      queue.name.startsWith('{') && queue.name.endsWith('}') ? queue.name.slice(1, -1) : queue.name;
    const parts = nameToSplit.split(queue.delimiter);
    let currentLevel = root.children;

    parts.forEach((part, index) => {
      let node = currentLevel.find((n) => n.name === part);

      if (!node) {
        const isLeafNode = index === parts.length - 1;
        node = {
          name: part,
          prefix: parts.slice(0, index + 1).join(queue.delimiter),
          children: [],
          // Only set queue data if we're at the leaf node
          ...(isLeafNode ? { queue } : {}),
        };
        currentLevel.push(node);
      }

      currentLevel = node.children;
    });
  });

  return root;
}

function treeValue(tree: AppQueueTreeNode, sortKey: 'alphabetical'): string;
function treeValue(tree: AppQueueTreeNode, sortKey: keyof AppQueue['counts']): number;
function treeValue(tree: AppQueueTreeNode, sortKey: QueueSortKey): string | number {
  if (sortKey === 'alphabetical') {
    if (tree == null) return '';

    return (
      (tree.queue?.displayName ?? tree.queue?.name ?? tree.name) +
      treeValue(tree.children[0], sortKey)
    );
  }

  if (tree == null) return 0;

  return (
    (tree.queue?.counts[sortKey] ?? 0) +
    tree.children.reduce((total, child) => total + treeValue(child, sortKey), 0)
  );
}

export function sortTree(
  tree: AppQueueTreeNode,
  sortKey: QueueSortKey = 'alphabetical',
  sortDirection: SortDirection = 'asc'
): AppQueueTreeNode {
  return {
    ...tree,
    children: tree.children
      .map((node) => sortTree(node, sortKey, sortDirection))
      .sort((a, z) => {
        if (sortKey === 'alphabetical')
          return sortDirection === 'asc'
            ? treeValue(a, sortKey).localeCompare(treeValue(z, sortKey))
            : treeValue(z, sortKey).localeCompare(treeValue(a, sortKey));

        return sortDirection === 'asc'
          ? treeValue(a, sortKey) - treeValue(z, sortKey)
          : treeValue(z, sortKey) - treeValue(a, sortKey);
      }),
  };
}
