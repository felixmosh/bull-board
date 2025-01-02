import { AppQueue } from '@bull-board/api/typings/app';

export interface AppQueueTree {
  [key: string]: {
    children: AppQueueTree;
    queue?: AppQueue;
  };
}

export function toTree(queues: AppQueue[]): AppQueueTree {
  const tree: AppQueueTree = {};
  queues.forEach((queue) => {
    if (queue.delimiter) {
      const levels = queue.name.split(queue.delimiter);
      let current = tree;

      levels.forEach((level, index) => {
        current[level] = current[level] || { children: {} };

        if (index === levels.length - 1) {
          current[level].queue = queue;
        }

        current = current[level].children;
      });
    } else {
      tree[queue.name] = {
        children: {},
        queue: queue,
      };
    }
  });
  return tree;
}
