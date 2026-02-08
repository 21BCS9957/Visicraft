import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { 
  addEdge, 
  applyNodeChanges, 
  applyEdgeChanges,
  Connection,
  NodeChange,
  EdgeChange,
} from 'reactflow';
import { WorkflowNode, WorkflowEdge, NodeType, ExecutionStatus } from '@/types/workflow';
import { nanoid } from 'nanoid';

interface WorkflowStore {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodes: string[];
  executionStatus: ExecutionStatus;
  
  // Node actions
  addNode: (type: NodeType, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<any>) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  
  // Edge actions
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  removeEdge: (id: string) => void;
  
  // Selection
  setSelectedNodes: (ids: string[]) => void;
  
  // Execution
  setExecutionStatus: (status: ExecutionStatus) => void;
  
  // Workflow management
  clearWorkflow: () => void;
  loadWorkflow: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
}

const createNodeData = (type: NodeType) => {
  const baseData = {
    label: type.charAt(0).toUpperCase() + type.slice(1),
    status: 'idle' as const,
  };

  switch (type) {
    case 'referenceImage':
    case 'sourceImage':
    case 'import':
      return {
        ...baseData,
        image: null,
        preview: null,
        uploaded: false,
      };
    case 'prompt':
      return {
        ...baseData,
        text: '',
        maxLength: 500,
      };
    case 'generate':
      return {
        ...baseData,
        settings: {
          resolution: '2K' as const,
          aspectRatio: '16:9' as const,
        },
        progress: 0,
      };
    case 'output':
      return {
        ...baseData,
        images: [],
        downloadable: true,
        showMetadata: false,
      };
    default:
      return baseData;
  }
};

export const useWorkflowStore = create<WorkflowStore>()(
  immer((set, get) => ({
    nodes: [],
    edges: [],
    selectedNodes: [],
    executionStatus: 'idle',

    addNode: (type, position) => {
      const newNode: WorkflowNode = {
        id: nanoid(),
        type,
        position,
        data: createNodeData(type) as any,
      };
      
      set((state) => {
        state.nodes.push(newNode);
      });
    },

    removeNode: (id) => {
      set((state) => {
        state.nodes = state.nodes.filter((node) => node.id !== id);
        state.edges = state.edges.filter(
          (edge) => edge.source !== id && edge.target !== id
        );
      });
    },

    updateNodeData: (id, data) => {
      set((state) => {
        const node = state.nodes.find((n) => n.id === id);
        if (node) {
          Object.assign(node.data, data);
        }
      });
    },

    onNodesChange: (changes) => {
      set((state) => {
        state.nodes = applyNodeChanges(changes, state.nodes) as WorkflowNode[];
      });
    },

    onEdgesChange: (changes) => {
      set((state) => {
        state.edges = applyEdgeChanges(changes, state.edges) as WorkflowEdge[];
      });
    },

    onConnect: (connection) => {
      set((state) => {
        const newEdge: WorkflowEdge = {
          ...connection,
          id: nanoid(),
          source: connection.source!,
          target: connection.target!,
          animated: true,
          type: 'smoothstep',
        };
        state.edges = addEdge(newEdge, state.edges) as WorkflowEdge[];
      });
    },

    removeEdge: (id) => {
      set((state) => {
        state.edges = state.edges.filter((edge) => edge.id !== id);
      });
    },

    setSelectedNodes: (ids) => {
      set({ selectedNodes: ids });
    },

    setExecutionStatus: (status) => {
      set({ executionStatus: status });
    },

    clearWorkflow: () => {
      set({
        nodes: [],
        edges: [],
        selectedNodes: [],
        executionStatus: 'idle',
      });
    },

    loadWorkflow: (nodes, edges) => {
      set({
        nodes,
        edges,
        selectedNodes: [],
        executionStatus: 'idle',
      });
    },
  }))
);
