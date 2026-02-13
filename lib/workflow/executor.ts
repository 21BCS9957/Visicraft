import { WorkflowNode, WorkflowEdge } from '@/types/workflow';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import toast from 'react-hot-toast';

interface DependencyGraph {
  [nodeId: string]: {
    node: WorkflowNode;
    inputs: { [handleId: string]: string | null }; // handleId -> source node value
    outputs: { [handleId: string]: any };
  };
}

export async function executeWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  // Build dependency graph
  const graph = buildDependencyGraph(nodes, edges);
  
  // Validate workflow
  const validation = validateWorkflow(graph, nodes);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }
  
  // Get execution order (topological sort)
  const executionOrder = topologicalSort(graph, edges);
  
  // Execute nodes in order
  for (const nodeId of executionOrder) {
    const nodeData = graph[nodeId];
    await executeNode(nodeData.node, graph, edges);
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

async function executeNode(node: WorkflowNode, graph: DependencyGraph, edges: WorkflowEdge[]) {
  const updateNodeData = useWorkflowStore.getState().updateNodeData;
  
  try {
    updateNodeData(node.id, { status: 'processing' });
    
    switch (node.type) {
      case 'referenceImage':
      case 'sourceImage':
        // Images should already be uploaded
        const imageData = node.data as any;
        if (!imageData.uploaded || !imageData.supabaseUrl) {
          throw new Error(`${node.type} must be uploaded before execution`);
        }
        graph[node.id].outputs['image'] = imageData.supabaseUrl;
        break;
        
      case 'prompt':
        const promptData = node.data as any;
        graph[node.id].outputs['prompt'] = promptData.text;
        break;
        
      case 'generate':
        await executeGenerateNode(node, graph, edges);
        break;
        
      case 'output':
        executeOutputNode(node, graph);
        break;
    }
    
    updateNodeData(node.id, { status: 'complete' });
  } catch (error) {
    updateNodeData(node.id, { status: 'error' });
    throw error;
  }
}

async function executeGenerateNode(node: WorkflowNode, graph: DependencyGraph, edges: WorkflowEdge[]) {
  const updateNodeData = useWorkflowStore.getState().updateNodeData;
  const nodeData = graph[node.id];
  
  console.log('Executing Generate Node:', node.id);
  console.log('Generate node inputs:', nodeData.inputs);
  
  // Get input values
  const referenceImageNodeId = nodeData.inputs['referenceImage'];
  const sourceImageNodeId = nodeData.inputs['sourceImage'];
  const promptNodeId = nodeData.inputs['prompt'];
  
  if (!referenceImageNodeId || !sourceImageNodeId) {
    throw new Error('Generate node missing required inputs');
  }
  
  const referenceImageUrl = graph[referenceImageNodeId].outputs['image'];
  const sourceImageUrl = graph[sourceImageNodeId].outputs['image'];
  const prompt = promptNodeId ? graph[promptNodeId].outputs['prompt'] : '';
  
  console.log('Reference URL:', referenceImageUrl);
  console.log('Source URL:', sourceImageUrl);
  console.log('Prompt:', prompt);
  
  const generateData = node.data as any;
  
  // Call API
  updateNodeData(node.id, { progress: 10 });
  
  console.log('Calling generation API...');
  
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      referenceImage: referenceImageUrl,
      sourceImages: [sourceImageUrl],
      prompt: prompt || undefined,
      model: generateData.settings?.model,
      aspectRatio: generateData.settings?.aspectRatio,
      resolution: generateData.settings?.resolution,
    }),
  });
  
  updateNodeData(node.id, { progress: 50 });
  
  if (!response.ok) {
    const error = await response.json();
    console.error('API error:', error);
    throw new Error(error.error || 'Generation failed');
  }
  
  const result = await response.json();
  console.log('API response:', result);
  
  updateNodeData(node.id, { progress: 100 });
  
  // Store outputs
  const generatedImageUrl = result.thumbnails?.[0] || result.imageUrl;
  console.log('Storing generated image URL:', generatedImageUrl);
  
  graph[node.id].outputs['generatedImage'] = generatedImageUrl;
  graph[node.id].outputs['metadata'] = result.metadata || {};
  
  console.log('Generate node outputs set:', graph[node.id].outputs);
}

function executeOutputNode(node: WorkflowNode, graph: DependencyGraph) {
  const updateNodeData = useWorkflowStore.getState().updateNodeData;
  const nodeData = graph[node.id];
  
  console.log('=== EXECUTING OUTPUT NODE ===');
  console.log('Output Node ID:', node.id);
  console.log('Output node inputs:', nodeData.inputs);
  console.log('Current node data:', node.data);
  
  // Get input value - the connection should be to 'image' handle
  const sourceNodeId = nodeData.inputs['image'];
  if (!sourceNodeId) {
    console.error('❌ Output node has no input connected');
    throw new Error('Output node has no input connected');
  }
  
  console.log('✓ Source node ID:', sourceNodeId);
  console.log('✓ Source node data:', graph[sourceNodeId]);
  console.log('✓ Source node outputs:', graph[sourceNodeId]?.outputs);
  
  // Get the generated image from the source node
  const sourceNode = graph[sourceNodeId];
  const imageUrl = sourceNode.outputs['generatedImage'];
  
  console.log('✓ Generated image URL:', imageUrl);
  
  if (!imageUrl) {
    console.error('❌ No generated image available from source node');
    console.error('Available outputs:', Object.keys(sourceNode.outputs));
    throw new Error('No generated image available');
  }
  
  // Update output node with image
  const updateData = {
    images: [imageUrl],
    metadata: sourceNode.outputs['metadata'] || {},
    status: 'complete',
  };
  
  console.log('📝 Updating output node with data:', updateData);
  updateNodeData(node.id, updateData);
  
  // Verify the update
  const updatedNode = useWorkflowStore.getState().nodes.find(n => n.id === node.id);
  console.log('✓ Node after update:', updatedNode?.data);
  console.log('=== OUTPUT NODE EXECUTION COMPLETE ===');
}
