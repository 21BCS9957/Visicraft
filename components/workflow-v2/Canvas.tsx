'use client';

import React, { useCallback, useRef, useState } from 'react';
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

function FlowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        id: `edge-${Date.now()}`,
        ...params,
        source: params.source!,
        target: params.target!,
        type: 'custom',
        animated: true,
        style: {
          strokeWidth: 2,
        },
        data: {
          gradient: getConnectionGradient(params),
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      
      // Update target node with source data immediately
      setNodes((nds) => {
        const sourceNode = nds.find(n => n.id === params.source);
        const targetNode = nds.find(n => n.id === params.target);
        
        if (!sourceNode || !targetNode) return nds;

        // Create a new array with updated target node
        return nds.map(node => {
          if (node.id !== params.target) return node;
          
          // Clone the node and update its data
          const updatedNode = { ...node, data: { ...node.data } };
          
          // If connecting to Generate node, update its data
          if (updatedNode.type === 'generate') {
            const handleId = params.targetHandle;
            
            console.log('🔗 Connection made:', {
              from: sourceNode.type,
              to: targetNode.type,
              handle: handleId,
              sourceData: sourceNode.data
            });
            
            if (handleId === 'referenceImage' && sourceNode.data.supabaseUrl) {
              updatedNode.data.referenceImageUrl = sourceNode.data.supabaseUrl;
              console.log('✅ Set referenceImageUrl:', sourceNode.data.supabaseUrl);
            } else if (handleId === 'sourceImage' && sourceNode.data.supabaseUrl) {
              updatedNode.data.sourceImageUrl = sourceNode.data.supabaseUrl;
              console.log('✅ Set sourceImageUrl:', sourceNode.data.supabaseUrl);
            } else if (handleId === 'prompt' && sourceNode.data.text) {
              updatedNode.data.promptText = sourceNode.data.text;
              console.log('✅ Set promptText:', sourceNode.data.text);
            }
          }
          
          // If connecting from Generate to Output, update output data
          if (sourceNode.type === 'generate' && updatedNode.type === 'output') {
            if (sourceNode.data.generatedImage) {
              updatedNode.data.images = [sourceNode.data.generatedImage];
              console.log('✅ Set output images');
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

  const handleAddNode = useCallback((type: string, position: { x: number; y: number }) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: {},
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
      // Cast nodes to WorkflowNode type for executor
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

  return (
    <div className="w-full h-screen flex flex-col bg-black">
      <Topbar />
      
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
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'custom',
              animated: true,
            }}
          >
            <Background
              color="#ffffff"
              gap={20}
              size={1.5}
              variant={BackgroundVariant.Dots}
              className="opacity-20"
            />
            
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'generate') return '#ef4444';
                if (node.type === 'import') return '#3b82f6';
                if (node.type === 'prompt') return '#8b5cf6';
                return '#666666';
              }}
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

// Helper function for connection gradients
function getConnectionGradient(connection: Connection) {
  const colors = ['#3b82f6', '#f97316', '#eab308', '#06b6d4', '#8b5cf6'];
  const source = connection.source || '';
  const target = connection.target || '';
  const hash = (source + target).split('').reduce(
    (acc, char) => acc + char.charCodeAt(0),
    0
  );
  return colors[hash % colors.length];
}
