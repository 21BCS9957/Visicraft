import { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import { getCreditCost } from '@/lib/credits/calculator';
import { executeGeneration } from './generateNode';

interface DependencyGraph {
  [nodeId: string]: {
    node: WorkflowNode;
    inputs: { [handleId: string]: string | null };
    outputs: { [handleId: string]: any };
  };
}

export type UpdateNodeDataFn = (nodeId: string, data: Record<string, unknown>) => void;

export interface ExecuteWorkflowOptions {
  updateNodeData?: UpdateNodeDataFn;
  credits?: number;
  deductCredits?: (amount: number) => Promise<boolean>;
  addCredits?: (amount: number) => Promise<boolean>;
  refreshCredits?: () => Promise<void>;
}

export async function executeWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  options?: ExecuteWorkflowOptions
) {
  const updateNodeData = options?.updateNodeData ?? useWorkflowStore.getState().updateNodeData;

  const graph = buildDependencyGraph(nodes, edges);

  const hasGenerate = nodes.some(n => n.type === 'generate');
  if (!hasGenerate) {
    throw new Error('Workflow must have at least one Generate node');
  }

  // Pre-validate in SAME order as Create (credits → image → prompt)
  const generateNodes = nodes.filter(n => n.type === 'generate');
  let totalCreditCost = 0;
  for (const n of generateNodes) {
    const d = n.data as any;
    totalCreditCost += getCreditCost(d?.model ?? 'nano-banana-pro', d?.resolution ?? '2K');
  }
  if (options?.deductCredits && options.credits !== undefined && options.credits < totalCreditCost) {
    throw new Error(`Insufficient credits! Need ${totalCreditCost}, have ${options.credits}`);
  }

  const executionOrder = topologicalSort(graph, edges);

  for (const nodeId of executionOrder) {
    const nodeData = graph[nodeId];
    await executeNode(nodeData.node, graph, updateNodeData, options);
  }
}

function buildDependencyGraph(nodes: WorkflowNode[], edges: WorkflowEdge[]): DependencyGraph {
  const graph: DependencyGraph = {};

  nodes.forEach(node => {
    graph[node.id] = { node, inputs: {}, outputs: {} };
  });

  edges.forEach(edge => {
    const source = edge.source as string;
    const target = edge.target as string;
    const targetHandle = edge.targetHandle as string;
    if (source && target && targetHandle) {
      graph[target].inputs[targetHandle] = source;
    }
  });

  return graph;
}

function topologicalSort(graph: DependencyGraph, edges: WorkflowEdge[]): string[] {
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const nodeData = graph[nodeId];
    Object.values(nodeData.inputs).forEach(sourceNodeId => {
      if (sourceNodeId) visit(sourceNodeId);
    });
    order.push(nodeId);
  }

  Object.keys(graph).forEach(nodeId => visit(nodeId));
  return order;
}

async function executeNode(
  node: WorkflowNode,
  graph: DependencyGraph,
  updateNodeData: UpdateNodeDataFn,
  options?: ExecuteWorkflowOptions
) {
  try {
    updateNodeData(node.id, { status: 'processing' });

    switch (node.type) {
      case 'referenceImage':
      case 'sourceImage':
      case 'import': {
        const imageData = node.data as any;
        if (imageData.uploaded && imageData.supabaseUrl) {
          graph[node.id].outputs['image'] = imageData.supabaseUrl;
        }
        // Don't throw — empty Import nodes are fine.
        // executeGeneration validates if the Generate node has enough images.
        break;
      }

      case 'prompt': {
        const promptData = node.data as any;
        graph[node.id].outputs['prompt'] = promptData.text;
        break;
      }

      case 'generate':
        await executeGenerateNode(node, graph, updateNodeData, options);
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
  updateNodeData: UpdateNodeDataFn,
  options?: ExecuteWorkflowOptions
) {
  const nodeData = graph[node.id];
  const referenceImageNodeId = nodeData.inputs['referenceImage'];
  const sourceImageNodeId = nodeData.inputs['sourceImage'];
  const promptNodeId = nodeData.inputs['prompt'];

  const refUrl = referenceImageNodeId ? graph[referenceImageNodeId].outputs['image'] : null;
  const srcUrl = sourceImageNodeId ? graph[sourceImageNodeId].outputs['image'] : null;
  const prompt = promptNodeId ? graph[promptNodeId].outputs['prompt'] : null;

  const d = node.data as any;
  const model = d?.model ?? d?.settings?.model ?? 'nano-banana-pro';
  const resolution = d?.resolution ?? d?.settings?.resolution ?? '2K';
  const aspectRatio = d?.aspectRatio ?? d?.settings?.aspectRatio ?? '16:9';

  const generatedImageUrl = await executeGeneration({
    nodeId: node.id,
    referenceImageUrl: refUrl,
    sourceImageUrl: srcUrl,
    promptText: prompt,
    model,
    aspectRatio,
    resolution,
    updateNodeData,
    credits: options?.credits,
    deductCredits: options?.deductCredits,
    addCredits: options?.addCredits,
    refreshCredits: options?.refreshCredits,
  });

  graph[node.id].outputs['image'] = generatedImageUrl;
  graph[node.id].outputs['generatedImage'] = generatedImageUrl;
  graph[node.id].outputs['metadata'] = {};
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
  const imageUrl = graph[sourceNodeId].outputs['generatedImage'];
  if (!imageUrl) {
    throw new Error('No generated image available');
  }
  updateNodeData(node.id, {
    images: [imageUrl],
    metadata: graph[sourceNodeId].outputs['metadata'] || {},
    status: 'complete',
  });
}
