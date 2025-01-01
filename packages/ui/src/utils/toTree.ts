import { AppQueue } from '@bull-board/api/typings/app';

export interface AppQueueTree {
  [key: string]: {
    children: AppQueueTree;
    queue?: AppQueue;
  };
}

export function toTree(array: AppQueue[]): AppQueueTree {
  const tree: AppQueueTree = {};
  array.forEach((item) => {
    if (item.delimiter) {
      const levels = item.name.split(item.delimiter);
      let current = tree;

      levels.forEach((level, index) => {
        current[level] = current[level] || { children: {} };

        if (index === levels.length - 1) {
          current[level].queue = item;
        }

        current = current[level].children;
      });
    } else {
      tree[item.name] = {
        children: {},
        queue: item,
      };
    }
  });
  return tree;
}
