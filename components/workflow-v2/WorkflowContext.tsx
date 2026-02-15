'use client';

import { createContext, useContext, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

type SetNodesFunc = (updater: Node[] | ((nodes: Node[]) => Node[])) => void;
type SetEdgesFunc = (updater: Edge[] | ((edges: Edge[]) => Edge[])) => void;

interface WorkflowContextValue {
  /** Update a specific node's data — goes through Canvas's React state (useNodesState) */
  updateNodeData: (nodeId: string, newData: Record<string, any>) => void;
  setNodes: SetNodesFunc;
  setEdges: SetEdgesFunc;
  /** Latest nodes — always use this when reading for Create/Run (image + prompt from source nodes) */
  getLatestNodes: () => Node[];
  /** Latest edges — use with getLatestNodes to find connected sources */
  getLatestEdges: () => Edge[];
}

const WorkflowContext = createContext<WorkflowContextValue>({
  updateNodeData: () => {},
  setNodes: () => {},
  setEdges: () => {},
  getLatestNodes: () => [],
  getLatestEdges: () => [],
});

export function useWorkflow() {
  return useContext(WorkflowContext);
}

export function useUpdateNodeData() {
  const { updateNodeData } = useContext(WorkflowContext);
  return updateNodeData;
}

export { WorkflowContext };
