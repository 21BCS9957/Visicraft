import { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import { getCreditCost } from '@/lib/credits/calculator';
import { executeGeneration } from './generateNode';
import { executeVideoGeneration, getVideoGenerationCreditCost } from './videoGenerateNode';
import { isSeedanceModel } from './seedance';

type InputValue = string | string[] | null;
type NodeOutputValue = string | string[] | Record<string, unknown> | null | undefined;
type WorkflowNodeData = Record<string, unknown> & {
  settings?: Record<string, unknown>;
};

interface DependencyGraph {
  [nodeId: string]: {
    node: WorkflowNode;
    inputs: { [handleId: string]: InputValue };
    outputs: { [handleId: string]: NodeOutputValue };
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

  let totalCreditCost = 0;
  for (const n of nodes) {
    const d = toWorkflowNodeData(n.data);
    if (n.type === 'generate') {
      totalCreditCost += getCreditCost(getStringValue(d.model, 'nano-banana-pro'), getStringValue(d.resolution, '2K'));
    } else if (n.type === 'videoGenerate') {
      totalCreditCost += getVideoGenerationCreditCost(
        getStringValue(d.model, 'veo-2.0-generate-001'),
        getStringValue(d.resolution, '720p'),
        getStringValue(d.duration, '5s')
      );
    }
  }
  if (options?.deductCredits && options?.credits !== undefined && options.credits < totalCreditCost) {
    throw new Error(`Insufficient credits! Need ${totalCreditCost}, have ${options.credits}`);
  }

  const executionOrder = topologicalSort(graph);

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

    if (targetHandle === 'referenceImage' || targetHandle === 'prompt') {
      const prev = graph[target].inputs[targetHandle];
      const next: string[] = Array.isArray(prev) ? [...prev, source] : prev ? [prev as string, source] : [source];
      graph[target].inputs[targetHandle] = next;
    } else {
      graph[target].inputs[targetHandle] = source;
    }
  });

  return graph;
}

function topologicalSort(graph: DependencyGraph): string[] {
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
        const imageData = toWorkflowNodeData(node.data);
        if (imageData.uploaded && imageData.supabaseUrl) {
          const url = getStringValue(imageData.supabaseUrl);
          graph[node.id].outputs['image'] = url;
          graph[node.id].outputs['referenceImage'] = url;
        }
        break;
      }

      case 'prompt': {
        const promptData = toWorkflowNodeData(node.data);
        graph[node.id].outputs['prompt'] = getStringValue(promptData.text);
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
  const refNodeIds = getInputNodeIds(nodeData.inputs['referenceImage']);
  const promptNodeIds = getInputNodeIds(nodeData.inputs['prompt']);

  const referenceImageUrls = uniqueStrings(
    refNodeIds.flatMap(id => resolveReferenceOutputUrls(graph, id))
  );

  const prompt = collectPromptOutputs(graph, promptNodeIds) || getStringValue(toWorkflowNodeData(node.data).promptText, '');

  const d = toWorkflowNodeData(node.data);
  const model = getNodeSetting(d, 'model', 'nano-banana-pro');
  const resolution = getNodeSetting(d, 'resolution', '2K');
  const aspectRatio = getNodeSetting(d, 'aspectRatio', '16:9');

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
  const refNodeIds = getInputNodeIds(nodeData.inputs['referenceImage']);
  const promptNodeIds = getInputNodeIds(nodeData.inputs['prompt']);

  const prompt = collectPromptOutputs(graph, promptNodeIds) || getStringValue(toWorkflowNodeData(node.data).promptText, '');

  const d = toWorkflowNodeData(node.data);
  const model = getNodeSetting(d, 'model', 'veo-2.0-generate-001');
  const aspectRatio = getNodeSetting(d, 'aspectRatio', '16:9');
  const duration = getNodeSetting(d, 'duration', '5s');
  const resolution = getNodeSetting(d, 'resolution', '720p');
  const mode = getStringValue(d.mode);
  const shouldResolveReferences = !(isSeedanceModel(model) && mode === 'text_to_video');
  const referenceImageUrls = shouldResolveReferences
    ? uniqueStrings(refNodeIds.flatMap(id => resolveReferenceOutputUrls(graph, id)))
    : [];

  const videoUrl = await executeVideoGeneration({
    nodeId: node.id,
    referenceImageUrls,
    promptText: prompt,
    model,
    aspectRatio,
    duration,
    resolution,
    mode,
    updateNodeData,
    credits: options?.credits,
    deductCredits: options?.deductCredits,
    addCredits: options?.addCredits,
    refreshCredits: options?.refreshCredits,
  });

  graph[node.id].outputs['generatedVideo'] = videoUrl;
  graph[node.id].outputs['image'] = videoUrl;
  graph[node.id].outputs['video'] = videoUrl;
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
  const generatedVideo = getFirstString([
    graph[sourceNodeId].outputs['generatedVideo'],
    graph[sourceNodeId].outputs['video'],
  ]);
  const mediaUrl = generatedVideo || getFirstString([
    graph[sourceNodeId].outputs['generatedImage'],
    graph[sourceNodeId].outputs['image'],
  ]);
  if (!mediaUrl) {
    throw new Error('No generated image or video available');
  }
  updateNodeData(node.id, {
    images: [mediaUrl],
    mediaType: generatedVideo ? 'video' : 'image',
    metadata: graph[sourceNodeId].outputs['metadata'] || {},
    status: 'complete',
  });
}

function getInputNodeIds(value: InputValue): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index) => value.length > 0 && values.indexOf(value) === index);
}

function resolveReferenceOutputUrls(graph: DependencyGraph, nodeId: string): string[] {
  const outputs = graph[nodeId]?.outputs;
  if (!outputs) return [];

  const urls = [
    outputs['image'],
    outputs['referenceImage'],
    outputs['generatedImage'],
    outputs['generatedVideo'],
    outputs['video'],
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (urls.length === 0) {
    throw new Error('A connected reference node did not produce an image or video asset.');
  }

  return urls;
}

function collectPromptOutputs(graph: DependencyGraph, nodeIds: string[]): string | null {
  const prompts = nodeIds
    .map(id => graph[id]?.outputs['prompt'])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return prompts.length > 0 ? prompts.join('\n\n') : null;
}

function getStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function toWorkflowNodeData(data: unknown): WorkflowNodeData {
  return data && typeof data === 'object' ? (data as WorkflowNodeData) : {};
}

function getNodeSetting(data: WorkflowNodeData, key: string, fallback: string): string {
  return getStringValue(data[key], getStringValue(data.settings?.[key], fallback));
}

function getFirstString(values: NodeOutputValue[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}
