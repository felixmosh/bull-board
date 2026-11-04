import type { AppQueue } from '@bull-board/api/typings/app';

export interface AppQueueTreeNode {
  name: string;
  queue?: AppQueue;
  children: AppQueueTreeNode[];
}

/** Separators a queue name is split on when grouping by prefix: `Checkout-Order` -> `Checkout`. */
const PREFIX_SEPARATOR = /[-_:.\s]/;

function namePrefix(name: string): { prefix: string; rest: string } | undefined {
  const match = PREFIX_SEPARATOR.exec(name);
  if (!match || match.index === 0 || match.index === name.length - 1) return undefined;
  return { prefix: name.slice(0, match.index), rest: name.slice(match.index + 1) };
}

/**
 * Queues registered without a delimiter, grouped by the first word of their name. A prefix only
 * becomes a group when two or more queues share it (case insensitively); a lone queue stays a
 * leaf under its full name.
 */
function groupByPrefix(queues: AppQueue[]): AppQueueTreeNode[] {
  const groups = new Map<string, { name: string; members: AppQueue[] }>();
  for (const queue of queues) {
    const parts = namePrefix(queue.name);
    const key = parts ? `prefix:${parts.prefix.toLowerCase()}` : `queue:${queue.name}`;
    const group = groups.get(key) ?? { name: parts?.prefix ?? queue.name, members: [] };
    group.members.push(queue);
    groups.set(key, group);
  }

  return [...groups.values()].flatMap(({ name, members }) =>
    members.length < 2
      ? members.map((queue) => ({ name: queue.name, queue, children: [] }))
      : [
          {
            name,
            children: members.map((queue) => ({
              name: namePrefix(queue.name)!.rest,
              queue,
              children: [],
            })),
          },
        ]
  );
}

export function toTree(
  queues: AppQueue[],
  sort = false,
  { groupByPrefix: byPrefix = false }: { groupByPrefix?: boolean } = {}
): AppQueueTreeNode {
  const root: AppQueueTreeNode = {
    name: 'root',
    children: [],
  };

  if (byPrefix) {
    root.children.push(...groupByPrefix(queues.filter((queue) => !queue.delimiter)));
  }

  queues.forEach((queue) => {
    if (byPrefix && !queue.delimiter) {
      return;
    }

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

  if (sort) {
    sortTree(root);
  }

  return root;
}

export function collectGroupPaths(node: AppQueueTreeNode, parentPath = ''): string[] {
  const paths: string[] = [];
  for (const child of node.children) {
    if (child.children.length > 0) {
      const path = parentPath ? `${parentPath}/${child.name}` : child.name;
      paths.push(path);
      paths.push(...collectGroupPaths(child, path));
    }
  }
  return paths;
}

function sortTree(node: AppQueueTreeNode): void {
  node.children.sort((a, b) => {
    const aIsGroup = a.children.length > 0;
    const bIsGroup = b.children.length > 0;

    // Groups first, then leaf queues
    if (aIsGroup !== bIsGroup) {
      return aIsGroup ? -1 : 1;
    }

    // Alphabetical within the same type
    return a.name.localeCompare(b.name);
  });

  node.children.forEach(sortTree);
}
