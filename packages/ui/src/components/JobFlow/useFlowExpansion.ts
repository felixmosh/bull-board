import type { FlowNode } from '@bull-board/api/typings/app';
import { useQueries } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { queryKeys } from '../../hooks/queryKeys';
import { useApi } from '../../hooks/useApi';
import { useSettingsStore } from '../../hooks/useSettings';
import { nodeKey } from './flowLayout';

const EXPANSION_DEPTH = 2;
const EXPANSION_MAX_CHILDREN = 1000;

export function mergeSubtrees(node: FlowNode, subtrees: Record<string, FlowNode>): FlowNode {
  const subtree = subtrees[nodeKey(node)];

  if (!subtree) {
    return { ...node, children: node.children.map((child) => mergeSubtrees(child, subtrees)) };
  }

  const loaded = new Map(node.children.map((child) => [nodeKey(child), child]));
  const children = subtree.children.map((child) => {
    const prior = loaded.get(nodeKey(child));
    const deeper =
      prior && prior.children.length > child.children.length
        ? { ...child, children: prior.children, truncated: prior.truncated }
        : child;

    return mergeSubtrees(deeper, subtrees);
  });

  return { ...node, children, truncated: subtree.truncated };
}

interface ExpandedRef {
  queueName: string;
  jobId: string;
}

export interface FlowExpansion {
  tree: FlowNode;
  expand: (node: FlowNode) => void;
  isExpanding: (key: string) => boolean;
  isExpanded: (key: string) => boolean;
}

export function useFlowExpansion(root: FlowNode): FlowExpansion {
  const api = useApi();
  const pollingInterval = useSettingsStore((state) => state.pollingInterval);
  const [expanded, setExpanded] = useState<ExpandedRef[]>([]);

  const results = useQueries({
    queries: expanded.map((ref) => ({
      queryKey: queryKeys.jobFlowNode(ref.queueName, ref.jobId),
      queryFn: () =>
        api.getJobFlow(ref.queueName, ref.jobId, {
          root: 'node' as const,
          depth: EXPANSION_DEPTH,
          maxChildren: EXPANSION_MAX_CHILDREN,
        }),
      refetchInterval: pollingInterval > 0 ? pollingInterval * 1000 : false,
    })),
  });

  const subtrees = useMemo(() => {
    const map: Record<string, FlowNode> = {};

    for (const result of results) {
      const flowRoot = result.data?.flowRoot;
      if (flowRoot) {
        map[nodeKey(flowRoot)] = flowRoot;
      }
    }

    return map;
  }, [results]);

  const pending = useMemo(() => {
    const keys = new Set<string>();

    expanded.forEach((ref, index) => {
      if (results[index]?.isPending) {
        keys.add(nodeKey({ id: ref.jobId, queueName: ref.queueName }));
      }
    });

    return keys;
  }, [expanded, results]);

  const expand = useCallback((node: FlowNode) => {
    setExpanded((current) =>
      current.some((ref) => ref.queueName === node.queueName && ref.jobId === node.id)
        ? current
        : [...current, { queueName: node.queueName, jobId: node.id }]
    );
  }, []);

  const expandedKeys = useMemo(
    () => new Set(expanded.map((ref) => nodeKey({ id: ref.jobId, queueName: ref.queueName }))),
    [expanded]
  );

  const tree = useMemo(() => mergeSubtrees(root, subtrees), [root, subtrees]);
  const isExpanding = useCallback((key: string) => pending.has(key), [pending]);
  const isExpanded = useCallback((key: string) => expandedKeys.has(key), [expandedKeys]);

  return { tree, expand, isExpanding, isExpanded };
}
