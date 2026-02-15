import { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import { useWorkflowStore } from '@/lib/stores/workflowStore';

interface DependencyGraph {
  [nodeId: string]: {
    node: WorkflowNode;
    inputs: { [handleId: string]: string | null };
    outputs: { [handleId: string]: any };
  };
}

export type UpdateNodeDataFn = (nodeId: string, data: Record<string, unknown>) => void;

export interface ExecuteWorkflowOptions {
  /** When provided, node updates (status, progress, generatedImage) apply to this instead of the store so Canvas UI updates */
  updateNodeData?: UpdateNodeDataFn;
}

export async function executeWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options?: ExecuteWorkflowOptions
) {
  const updateNodeData = options?.updateNodeData ?? useWorkflowStore.getState().updateNodeData;

  const graph = buildDependencyGraph(nodes, edges);
  const validation = validateWorkflow(graph, nodes);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }
  const executionOrder = topologicalSort(graph, edges);

  for (const nodeId of executionOrder) {
    const nodeData = graph[nodeId];
    await executeNode(nodeData.node, graph, edges, updateNodeData);
  }
}

function buildDependencyGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): DependencyGraph {
  const graph: DependencyGraph = {};
  
  // Initialize graph with all nodes
  nodes.forEach(node => {
    graph[node.id] = {
      node,
      inputs: {},
      outputs: {},
    };
  });
  
  // Map connections
  edges.forEach(edge => {
    const source = edge.source as string;
    const target = edge.target as string;
    const sourceHandle = edge.sourceHandle as string;
    const targetHandle = edge.targetHandle as string;
    
    if (source && target && sourceHandle && targetHandle) {
      graph[target].inputs[targetHandle] = source;
    }
  });
  
  return graph;
}

function validateWorkflow(graph: DependencyGraph, nodes: WorkflowNode[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check for required nodes
  const hasGenerate = nodes.some(n => n.type === 'generate');
  const hasOutput = nodes.some(n => n.type === 'output');
  
  if (!hasGenerate) {
    errors.push('Workflow must have at least one Generate node');
  }
  
  if (!hasOutput) {
    errors.push('Workflow must have at least one Output node');
  }
  
  // Check Generate node has required inputs
  nodes.forEach(node => {
    if (node.type === 'generate') {
      const nodeData = graph[node.id];
      if (!nodeData.inputs['referenceImage']) {
        errors.push('Generate node must have a Reference Image connected');
      }
      if (!nodeData.inputs['sourceImage']) {
        errors.push('Generate node must have a Source Image connected');
      }
      // Prompt is optional - no validation needed
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

function topologicalSort(graph: DependencyGraph, edges: WorkflowEdge[]): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  
  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    
    // Visit dependencies first
    const nodeData = graph[nodeId];
    Object.values(nodeData.inputs).forEach(sourceNodeId => {
      if (sourceNodeId) {
        visit(sourceNodeId);
      }
    });
    
    order.push(nodeId);
  }
  
  // Start from nodes with no inputs (source nodes)
  Object.keys(graph).forEach(nodeId => {
    visit(nodeId);
  });
  
  return order;
}

async function executeNode(
  node: WorkflowNode,
  graph: DependencyGraph,
  edges: WorkflowEdge[],
  updateNodeData: UpdateNodeDataFn
) {
  try {
    updateNodeData(node.id, { status: 'processing' });
    
    switch (node.type) {
      case 'referenceImage':
      case 'sourceImage':
      case 'import':
        const imageData = node.data as any;
        if (!imageData.uploaded || !imageData.supabaseUrl) {
          throw new Error(`Image node must be uploaded before execution`);
        }
        graph[node.id].outputs['image'] = imageData.supabaseUrl;
        break;
        
      case 'prompt':
        const promptData = node.data as any;
        graph[node.id].outputs['prompt'] = promptData.text;
        break;
        
      case 'generate':
        await executeGenerateNode(node, graph, edges, updateNodeData);
        break;
        
      case 'output':
        executeOutputNode(node, graph, updateNodeData);
        break;
    }
    
    updateNodeData(node.id, { status: 'complete' });
  } catch (error) {
    updateNodeData(node.id, { status: 'error' });
    throw error;
  }
}

async function executeGenerateNode(
  node: WorkflowNode,
  graph: DependencyGraph,
  edges: WorkflowEdge[],
  updateNodeData: UpdateNodeDataFn
) {
  const nodeData = graph[node.id];
  const referenceImageNodeId = nodeData.inputs['referenceImage'];
  const sourceImageNodeId = nodeData.inputs['sourceImage'];
  const promptNodeId = nodeData.inputs['prompt'];

  if (!referenceImageNodeId || !sourceImageNodeId) {
    throw new Error('Generate node missing required inputs');
  }

  const referenceImageUrl = graph[referenceImageNodeId].outputs['image'];
  const sourceImageUrl = graph[sourceImageNodeId].outputs['image'];
  const prompt = promptNodeId ? graph[promptNodeId].outputs['prompt'] : '';

  const generateData = node.data as any;
  const model = generateData?.model ?? generateData?.settings?.model ?? 'gemini-3-pro';
  const resolution = generateData?.resolution ?? generateData?.settings?.resolution ?? '2K';
  const aspectRatio = generateData?.aspectRatio ?? generateData?.settings?.aspectRatio ?? '16:9';

  updateNodeData(node.id, { progress: 10 });

  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      referenceImage: referenceImageUrl,
      sourceImages: [sourceImageUrl],
      prompt: prompt || undefined,
      model,
      aspectRatio,
      resolution,
    }),
  });

  updateNodeData(node.id, { progress: 50 });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || 'Generation failed');
  }

  const result = await response.json();
  updateNodeData(node.id, { progress: 100 });

  const generatedImageUrl = result.images?.[0] || result.thumbnails?.[0] || result.imageUrl;
  if (generatedImageUrl) {
    updateNodeData(node.id, { generatedImage: generatedImageUrl, status: 'complete' });
  }

  graph[node.id].outputs['generatedImage'] = generatedImageUrl;
  graph[node.id].outputs['metadata'] = result.metadata || {};
}

function executeOutputNode(
  node: WorkflowNode,
  graph: DependencyGraph,
  updateNodeData: UpdateNodeDataFn
) {
  const nodeData = graph[node.id];
  const sourceNodeId = nodeData.inputs['image'];
  if (!sourceNodeId) {
    throw new Error('Output node has no input connected');
  }

  const sourceNode = graph[sourceNodeId];
  const imageUrl = sourceNode.outputs['generatedImage'];
  if (!imageUrl) {
    throw new Error('No generated image available');
  }

  updateNodeData(node.id, {
    images: [imageUrl],
    metadata: sourceNode.outputs['metadata'] || {},
    status: 'complete',
  });
}
