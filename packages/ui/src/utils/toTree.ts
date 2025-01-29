import { AppQueue } from '@bull-board/api/typings/app';

export interface AppQueueTreeNode {
  name: string;
  queue?: AppQueue;
  children: AppQueueTreeNode[];
}

export function toTree(queues: AppQueue[]): AppQueueTreeNode {
  const root: AppQueueTreeNode = {
    name: 'root',
    children: [],
  };

  queues.forEach((queue) => {
    if (!queue.delimiter) {
      // If no delimiter, add as direct child to root
      root.children.push({
        name: queue.name,
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
