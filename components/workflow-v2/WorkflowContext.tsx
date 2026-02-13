'use client';

import { createContext, useContext, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

type SetNodesFunc = (updater: Node[] | ((nodes: Node[]) => Node[])) => void;
type SetEdgesFunc = (updater: Edge[] | ((edges: Edge[]) => Edge[])) => void;

interface WorkflowContextValue {
  /** Update a specific node's data — goes through Canvas's React state (useNodesState) */
  updateNodeData: (nodeId: string, newData: Record<string, any>) => void;
  /** Canvas's setNodes from useNodesState (NOT useReactFlow) */
  setNodes: SetNodesFunc;
  /** Canvas's setEdges from useEdgesState (NOT useReactFlow) */
  setEdges: SetEdgesFunc;
}

const WorkflowContext = createContext<WorkflowContextValue>({
  updateNodeData: () => {},
  setNodes: () => {},
  setEdges: () => {},
});

export function useWorkflow() {
  return useContext(WorkflowContext);
}

export function useUpdateNodeData() {
  const { updateNodeData } = useContext(WorkflowContext);
  return updateNodeData;
}

export { WorkflowContext };
