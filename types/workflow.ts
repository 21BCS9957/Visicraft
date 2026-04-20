import { Node, Edge } from 'reactflow';

export type NodeType = 
  | 'referenceImage' 
  | 'sourceImage' 
  | 'prompt' 
  | 'generate' 
  | 'videoGenerate'
  | 'output'
  | 'import';

export type ExecutionStatus = 'idle' | 'running' | 'paused' | 'complete' | 'error';
export type NodeStatus = 'idle' | 'processing' | 'complete' | 'error';

export interface Position {
  x: number;
  y: number;
}

// Base node data structure
export interface BaseNodeData {
  label: string;
  status: NodeStatus;
}

// Reference Image Node
export interface ReferenceImageNodeData extends BaseNodeData {
  image: File | null;
  preview: string | null;
  uploaded: boolean;
  supabaseUrl?: string;
}

// Source Image Node
export interface SourceImageNodeData extends BaseNodeData {
  image: File | null;
  preview: string | null;
  uploaded: boolean;
  supabaseUrl?: string;
}

// Prompt Node
export interface PromptNodeData extends BaseNodeData {
  text: string;
  maxLength: number;
}

// Generate Node
export interface GenerateNodeData extends BaseNodeData {
  settings: {
    resolution: '1K' | '2K' | '4K';
    aspectRatio: '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9' | 'auto';
  };
  progress: number;
  taskId?: string;
}

// Output Node
export interface OutputNodeData extends BaseNodeData {
  images: string[];
  metadata?: any;
  downloadable: boolean;
  showMetadata: boolean;
}

export type NodeData = 
  | ReferenceImageNodeData 
  | SourceImageNodeData 
  | PromptNodeData 
  | GenerateNodeData 
  | OutputNodeData;

export interface WorkflowNode extends Node {
  type: NodeType;
  data: NodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  animated?: boolean;
  type?: string;
  style?: React.CSSProperties;
  data?: any;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  thumbnail?: string;
  isTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'success' | 'error';
  inputData: any;
  outputData: any;
  errorMessage?: string;
  durationMs: number;
  createdAt: Date;
}
