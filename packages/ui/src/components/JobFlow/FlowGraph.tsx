import type { FlowNode } from '@bull-board/api/typings/app';
import {
  Background,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import { Crosshair, Maximize, Minus, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlowDetailsPanel } from './FlowDetailsPanel';
import { FlowJobNode } from './FlowJobNode';
import type { FlowGraphNode, FlowJobNodeData } from './flowLayout';
import { layoutFlow, nodeKey, shapeSignature } from './flowLayout';
import { useFlowExpansion } from './useFlowExpansion';
import styles from './FlowGraph.module.css';
import '@xyflow/react/dist/style.css';

const nodeTypes = { jobNode: FlowJobNode };

const MINIMAP_WIDTH = 140;
const MINIMAP_HEIGHT = 100;
const MINIMAP_FROM_NODES = 12;
const FIT_MIN_ZOOM = 0.15;

type Positions = Map<string, FlowGraphNode['position']>;

function usePositions(tree: FlowNode, nodes: FlowGraphNode[]): Positions {
  const signature = shapeSignature(tree);
  const cache = useRef<{ signature: string; positions: Positions } | null>(null);

  if (!cache.current || cache.current.signature !== signature) {
    cache.current = {
      signature,
      positions: new Map(nodes.map((node) => [node.id, node.position])),
    };
  }

  return cache.current.positions;
}

function findByKey(node: FlowNode, key: string): FlowNode | null {
  if (nodeKey(node) === key) {
    return node;
  }

  for (const child of node.children) {
    const found = findByKey(child, key);
    if (found) {
      return found;
    }
  }

  return null;
}

const ICON_SIZE = 15;

const FlowControls = ({
  focusNodeId,
  onFocus,
}: {
  focusNodeId: string | null;
  onFocus: () => void;
}) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { t } = useTranslation();

  return (
    <Controls showZoom={false} showFitView={false} showInteractive={false}>
      <ControlButton
        title={t('JOB.FLOW.ZOOM_IN')}
        aria-label={t('JOB.FLOW.ZOOM_IN')}
        onClick={() => void zoomIn({ duration: 200 })}
      >
        <Plus size={ICON_SIZE} />
      </ControlButton>
      <ControlButton
        title={t('JOB.FLOW.ZOOM_OUT')}
        aria-label={t('JOB.FLOW.ZOOM_OUT')}
        onClick={() => void zoomOut({ duration: 200 })}
      >
        <Minus size={ICON_SIZE} />
      </ControlButton>
      <ControlButton
        title={t('JOB.FLOW.FIT_VIEW')}
        aria-label={t('JOB.FLOW.FIT_VIEW')}
        onClick={() =>
          void fitView({ padding: 0.15, maxZoom: 1, minZoom: FIT_MIN_ZOOM, duration: 300 })
        }
      >
        <Maximize size={ICON_SIZE} />
      </ControlButton>
      {!!focusNodeId && (
        <ControlButton
          title={t('JOB.FLOW.FOCUS_JOB')}
          aria-label={t('JOB.FLOW.FOCUS_JOB')}
          onClick={() => {
            onFocus();
            void fitView({
              nodes: [{ id: focusNodeId }],
              padding: 2,
              maxZoom: 1,
              duration: 300,
            });
          }}
        >
          <Crosshair size={ICON_SIZE} />
        </ControlButton>
      )}
    </Controls>
  );
};

export interface FlowGraphProps {
  root: FlowNode;
  activeJob: Pick<FlowNode, 'id' | 'queueName'> | null;
}

const FlowGraph = ({ root, activeJob }: FlowGraphProps) => {
  const { t } = useTranslation();
  const activeKey = activeJob ? nodeKey(activeJob) : null;
  const { tree, expand, isExpanding, isExpanded } = useFlowExpansion(root);
  const [selectedKey, setSelectedKey] = useState<string | null>(activeKey);

  const describe = (node: FlowNode) =>
    t('JOB.FLOW.NODE_LABEL', {
      name: node.name ?? node.id,
      state: node.state,
      queue: node.queueName,
      id: node.id,
    });

  const laidOut = layoutFlow(tree, selectedKey, describe);
  const positions = usePositions(tree, laidOut.nodes);

  const nodes = laidOut.nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
    data: {
      ...node.data,
      isExpanding: isExpanding(node.id),
      isExpanded: isExpanded(node.id),
      onExpand: expand,
    },
  }));

  const selected = selectedKey ? findByKey(tree, selectedKey) : null;
  const focusable = nodes.some((node) => node.id === activeKey) ? activeKey : null;

  const ariaLabelConfig = {
    'node.a11yDescription.default': t('JOB.FLOW.A11Y_NODE'),
    'node.a11yDescription.keyboardDisabled': t('JOB.FLOW.A11Y_NODE'),
    'edge.a11yDescription.default': t('JOB.FLOW.A11Y_EDGE'),
  };

  return (
    <div className={styles.layout}>
      <div className={styles.panelSlot}>
        {selected ? (
          <FlowDetailsPanel node={selected} />
        ) : (
          <aside className={styles.panel}>
            <p className={styles.panelEmpty}>{t('JOB.FLOW.NO_SELECTION')}</p>
          </aside>
        )}
      </div>
      <div className={styles.canvasSlot}>
        <div className={styles.canvas}>
          <ReactFlow
            nodes={nodes}
            edges={laidOut.edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_event, node) => setSelectedKey(node.id)}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable
            elementsSelectable
            ariaLabelConfig={ariaLabelConfig}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1, minZoom: FIT_MIN_ZOOM }}
            minZoom={0.02}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') {
                return;
              }
              const target = (event.target as HTMLElement).closest('.react-flow__node');
              const id = target?.getAttribute('data-id');
              if (id) {
                event.preventDefault();
                setSelectedKey(id);
              }
            }}
          >
            <Background />
            <FlowControls
              focusNodeId={focusable}
              onFocus={() => focusable && setSelectedKey(focusable)}
            />
            {nodes.length >= MINIMAP_FROM_NODES && (
              <MiniMap
                className={styles.minimap}
                style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
                pannable
                zoomable
                nodeStrokeWidth={12}
                nodeClassName={(node) =>
                  `bb-flow-mini bb-flow-mini-${(node.data as unknown as FlowJobNodeData).node.state}`
                }
              />
            )}
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};

export default FlowGraph;
