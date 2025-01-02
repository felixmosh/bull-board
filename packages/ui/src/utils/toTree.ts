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

    const parts = queue.name.split(queue.delimiter);
    let currentLevel = root.children;
    let currentPath = '';

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}${queue.delimiter}${part}` : part;
      let node = currentLevel.find((n) => n.name === part);

      if (!node) {
        node = {
          name: part,
          children: [],
          // Only set queue data if we're at the leaf node
          ...(index === parts.length - 1 ? { queue } : {}),
        };
        currentLevel.push(node);
      }

      currentLevel = node.children;
    });
  });

  return root;
}
