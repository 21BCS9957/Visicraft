import { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import { getCreditCost } from '@/lib/credits/calculator';
import { executeGeneration } from './generateNode';
import { executeVideoGeneration } from './videoGenerateNode';

type InputValue = string | string[] | null;

interface DependencyGraph {
  [nodeId: string]: {
    node: WorkflowNode;
    inputs: { [handleId: string]: InputValue };
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

  const hasGenerate = nodes.some(n => n.type === 'generate' || n.type === 'videoGenerate');
  if (!hasGenerate) {
    throw new Error('Workflow must have at least one Generate or Video Generate node');
  }

  const VIDEO_CREDIT_COST = 120;
  let totalCreditCost = 0;
  for (const n of nodes) {
    const d = n.data as any;
    if (n.type === 'generate') {
      totalCreditCost += getCreditCost(d?.model ?? 'nano-banana-pro', d?.resolution ?? '2K');
    } else if (n.type === 'videoGenerate') {
      totalCreditCost += VIDEO_CREDIT_COST;
    }
  }
  if (options?.deductCredits && options?.credits !== undefined && options.credits < totalCreditCost) {
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
    if (!source || !target || !targetHandle) return;

    if (targetHandle === 'referenceImage') {
      const prev = graph[target].inputs['referenceImage'];
      const next: string[] = Array.isArray(prev) ? [...prev, source] : prev ? [prev as string, source] : [source];
      graph[target].inputs['referenceImage'] = next;
    } else {
      graph[target].inputs[targetHandle] = source;
    }
  });

  return graph;
}

function topologicalSort(graph: DependencyGraph, edges: WorkflowEdge[]): string[] {
  const visited = new Set<string>();
  const order: string[] = [];

  function visitInputIds(value: InputValue) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(id => {
        if (id) visit(id);
      });
    } else {
      visit(value);
    }
  }

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const nodeData = graph[nodeId];
    Object.values(nodeData.inputs).forEach(visitInputIds);
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

      case 'videoGenerate':
        await executeVideoGenerateNode(node, graph, updateNodeData, options);
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
  const refInput = nodeData.inputs['referenceImage'];
  const refNodeIds: string[] = Array.isArray(refInput)
    ? refInput
    : refInput
      ? [refInput as string]
      : [];
  const promptNodeId = nodeData.inputs['prompt'] as string | null;

  const referenceImageUrls = refNodeIds
    .map(id => graph[id]?.outputs['image'])
    .filter((u): u is string => typeof u === 'string' && u.length > 0);

  const prompt = promptNodeId ? graph[promptNodeId].outputs['prompt'] : null;

  const d = node.data as any;
  const model = d?.model ?? d?.settings?.model ?? 'nano-banana-pro';
  const resolution = d?.resolution ?? d?.settings?.resolution ?? '2K';
  const aspectRatio = d?.aspectRatio ?? d?.settings?.aspectRatio ?? '16:9';

  const generatedImageUrl = await executeGeneration({
    nodeId: node.id,
    referenceImageUrls,
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

async function executeVideoGenerateNode(
  node: WorkflowNode,
  graph: DependencyGraph,
  updateNodeData: UpdateNodeDataFn,
  options?: ExecuteWorkflowOptions
) {
  const nodeData = graph[node.id];
  const refInput = nodeData.inputs['referenceImage'];
  const refNodeIds: string[] = Array.isArray(refInput)
    ? refInput
    : refInput
      ? [refInput as string]
      : [];
  const promptNodeId = nodeData.inputs['prompt'] as string | null;

  const referenceImageUrls = refNodeIds
    .map(id => graph[id]?.outputs['image'])
    .filter((u): u is string => typeof u === 'string' && u.length > 0);

  const prompt = promptNodeId ? graph[promptNodeId].outputs['prompt'] : null;

  const d = node.data as any;
  const model = d?.model ?? 'veo-2.0-generate-001';
  const aspectRatio = d?.aspectRatio ?? '16:9';
  const duration = d?.duration ?? '5s';
  const resolution = d?.resolution ?? '720p';

  const videoUrl = await executeVideoGeneration({
    nodeId: node.id,
    referenceImageUrls,
    promptText: prompt,
    model,
    aspectRatio,
    duration,
    resolution,
    updateNodeData,
    credits: options?.credits,
    deductCredits: options?.deductCredits,
    addCredits: options?.addCredits,
    refreshCredits: options?.refreshCredits,
  });

  graph[node.id].outputs['generatedVideo'] = videoUrl;
  graph[node.id].outputs['image'] = videoUrl;
}

function executeOutputNode(
  node: WorkflowNode,
  graph: DependencyGraph,
  updateNodeData: UpdateNodeDataFn
) {
  const nodeData = graph[node.id];
  const sourceNodeId = nodeData.inputs['image'] as string | null;
  if (!sourceNodeId) {
    throw new Error('Output node has no input connected');
  }
  const imageUrl = graph[sourceNodeId].outputs['generatedImage'] || graph[sourceNodeId].outputs['generatedVideo'];
  if (!imageUrl) {
    throw new Error('No generated image or video available');
  }
  updateNodeData(node.id, {
    images: [imageUrl],
    metadata: graph[sourceNodeId].outputs['metadata'] || {},
    status: 'complete',
  });
}
