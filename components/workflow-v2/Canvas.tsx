'use client';

import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactFlow, {
  Background,
  BackgroundVariant,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  NodeChange,
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ImportNode } from './nodes/ImportNode';
import { PromptNode } from './nodes/PromptNode';
import { GenerateNode } from './nodes/GenerateNode';
import { OutputNode } from './nodes/OutputNode';
import { CustomEdge } from './CustomEdge';
import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { Topbar } from './Topbar';
import { RunControls } from './RunControls';
import { executeWorkflow } from '@/lib/workflow/executor';
import { loadTemplate } from '@/lib/workflow/templateLoader';
import toast from 'react-hot-toast';

// Define node and edge types outside component to prevent recreation
const nodeTypes = {
  import: ImportNode,
  prompt: PromptNode,
  generate: GenerateNode,
  output: OutputNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

// Memoized default edge options
const defaultEdgeOptions = {
  type: 'custom',
  animated: false,
};

// Memoized ReactFlow props
const proOptions = { hideAttribution: true };

function FlowCanvas() {
  const searchParams = useSearchParams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [templateLoaded, setTemplateLoaded] = useState(false);

  // Load template from URL parameter on mount
  useEffect(() => {
    if (!templateLoaded) {
      const template = searchParams.get('template') || 'custom';
      const { nodes: templateNodes, edges: templateEdges } = loadTemplate(template);
      setNodes(templateNodes);
      setEdges(templateEdges);
      setTemplateLoaded(true);
      
      if (template === 'custom') {
        toast.success('Blank canvas ready!');
      } else {
        const templateName = template.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        toast.success(`${templateName} template loaded!`);
      }
    }
  }, [searchParams, templateLoaded, setNodes, setEdges]);

  const handleSelectTemplate = useCallback((templateId: string) => {
    const { nodes: templateNodes, edges: templateEdges } = loadTemplate(templateId);
    setNodes(templateNodes);
    setEdges(templateEdges);
    
    if (templateId === 'custom') {
      toast.success('Blank canvas ready!');
    } else {
      const templateName = templateId.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      toast.success(`${templateName} template loaded!`);
    }
  }, [setNodes, setEdges]);

  // Optimized onConnect with minimal re-renders
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        id: `edge-${Date.now()}`,
        ...params,
        source: params.source!,
        target: params.target!,
        type: 'custom',
        animated: false,
        style: {
          strokeWidth: 2,
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      
      // Batch update target node with source data
      setNodes((nds) => {
        const sourceNode = nds.find(n => n.id === params.source);
        const targetNode = nds.find(n => n.id === params.target);
        
        if (!sourceNode || !targetNode) return nds;

        return nds.map(node => {
          if (node.id !== params.target) return node;
          
          const updatedNode = { ...node, data: { ...node.data } };
          
          if (updatedNode.type === 'generate') {
            const handleId = params.targetHandle;
            
            if (handleId === 'referenceImage' && sourceNode.data.supabaseUrl) {
              updatedNode.data.referenceImageUrl = sourceNode.data.supabaseUrl;
            } else if (handleId === 'sourceImage' && sourceNode.data.supabaseUrl) {
              updatedNode.data.sourceImageUrl = sourceNode.data.supabaseUrl;
            } else if (handleId === 'prompt' && sourceNode.data.text) {
              updatedNode.data.promptText = sourceNode.data.text;
            }
          }
          
          if (sourceNode.type === 'generate' && updatedNode.type === 'output') {
            if (sourceNode.data.generatedImage) {
              updatedNode.data.images = [sourceNode.data.generatedImage];
            }
          }
          
          return updatedNode;
        });
      });
    },
    [setEdges, setNodes]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
    },
    []
  );

  const handleAddNode = useCallback((type: string, position: { x: number; y: number }, nodeType?: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: nodeType ? { nodeType } : {},
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const handleRun = async () => {
    if (nodes.length === 0) {
      toast.error('Add some nodes first');
      return;
    }

    setIsRunning(true);
    try {
      toast.loading('Executing workflow...', { id: 'workflow' });
      await executeWorkflow(nodes as any, edges);
      toast.success('Workflow completed!', { id: 'workflow' });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Workflow failed',
        { id: 'workflow' }
      );
    } finally {
      setIsRunning(false);
    }
  };

  // Memoize MiniMap node color function
  const nodeColor = useCallback((node: Node) => {
    if (node.type === 'generate') return '#ef4444';
    if (node.type === 'import') return '#3b82f6';
    if (node.type === 'prompt') return '#8b5cf6';
    return '#666666';
  }, []);

  return (
    <div className="w-full h-screen flex flex-col bg-black">
      <Topbar onNewWorkflow={() => {
        // Reload with custom template
        window.location.href = '/workflow?template=custom';
      }} />
      
      <div className="flex-1 flex relative overflow-hidden">
        <Sidebar onAddNode={handleAddNode} />
        
        <div ref={reactFlowWrapper} className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            className="bg-black"
            proOptions={proOptions}
            defaultEdgeOptions={defaultEdgeOptions}
            // Performance optimizations
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            selectNodesOnDrag={false}
            panOnDrag={true}
            minZoom={0.2}
            maxZoom={4}
            // Disable expensive features during interaction
            onlyRenderVisibleElements={true}
            // Reduce re-renders
            nodeOrigin={[0.5, 0.5]}
          >
            <Background
              color="#ffffff"
              gap={20}
              size={1.5}
              variant={BackgroundVariant.Dots}
              className="opacity-20"
            />
            
            <MiniMap
              nodeColor={nodeColor}
              maskColor="rgba(0, 0, 0, 0.9)"
              className="!bg-[#0a0a0a] !border !border-[#2a2a2a] !rounded-lg"
              style={{
                position: 'absolute',
                bottom: 100,
                right: 24,
              }}
            />
          </ReactFlow>
        </div>
        
        <PropertiesPanel
          selectedNode={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      </div>
      
      <RunControls onRun={handleRun} isRunning={isRunning} />
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
