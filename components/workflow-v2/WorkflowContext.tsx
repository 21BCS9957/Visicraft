'use client';

import { createContext, useContext } from 'react';
import { Node, Edge } from 'reactflow';

type SetNodesFunc = (updater: Node[] | ((nodes: Node[]) => Node[])) => void;
type SetEdgesFunc = (updater: Edge[] | ((edges: Edge[]) => Edge[])) => void;

interface WorkflowContextValue {
  updateNodeData: (nodeId: string, newData: Record<string, any>) => void;
  setNodes: SetNodesFunc;
  setEdges: SetEdgesFunc;
  getLatestNodes: () => Node[];
  getLatestEdges: () => Edge[];
  /** True when any Generate node has status === 'processing'. Use to disable Create and Run Selected. */
  isGenerationRunning: boolean;
}

const WorkflowContext = createContext<WorkflowContextValue>({
  updateNodeData: () => {},
  setNodes: () => {},
  setEdges: () => {},
  getLatestNodes: () => [],
  getLatestEdges: () => [],
  isGenerationRunning: false,
});

export function useWorkflow() {
  return useContext(WorkflowContext);
}

export function useUpdateNodeData() {
  const { updateNodeData } = useContext(WorkflowContext);
  return updateNodeData;
}

export { WorkflowContext };
