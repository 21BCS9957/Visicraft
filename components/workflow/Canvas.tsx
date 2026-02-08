'use client';

import { useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ConnectionMode,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import { ReferenceImageNode } from './nodes/ReferenceImageNode';
import { SourceImageNode } from './nodes/SourceImageNode';
import { PromptNode } from './nodes/PromptNode';
import { GenerateNode } from './nodes/GenerateNode';
import { OutputNode } from './nodes/OutputNode';

const nodeTypes = {
  referenceImage: ReferenceImageNode,
  sourceImage: SourceImageNode,
  prompt: PromptNode,
  generate: GenerateNode,
  output: OutputNode,
};

const getNodeColor = (type: string) => {
  switch (type) {
    case 'referenceImage':
      return '#764ba2';
    case 'sourceImage':
      return '#3b82f6';
    case 'prompt':
      return '#059669';
    case 'generate':
      return '#ef4444';
    case 'output':
      return '#8b5cf6';
    default:
      return '#6b7280';
  }
};

export function Canvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
  } = useWorkflowStore();

  const onConnectHandler = useCallback((connection: any) => {
    // Add validation here if needed
    onConnect(connection);
  }, [onConnect]);

  return (
    <div className="w-full h-full bg-[#0a0a0a]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnectHandler}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        attributionPosition="bottom-left"
        className="workflow-canvas"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255, 255, 255, 0.05)"
          className="bg-[#0a0a0a]"
        />
        
        <Controls
          className="bg-[#1a1a1a] border border-gray-700 rounded-lg"
          showInteractive={false}
        />
        
        <MiniMap
          nodeColor={(node) => getNodeColor(node.type || '')}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="bg-[#1a1a1a] border border-gray-700 rounded-lg"
        />
      </ReactFlow>

      <style jsx global>{`
        .workflow-canvas .react-flow__edge-path {
          stroke-width: 2;
          stroke: #3b82f6;
        }
        
        .workflow-canvas .react-flow__edge.animated .react-flow__edge-path {
          stroke-dasharray: 5;
          animation: dashdraw 0.5s linear infinite;
        }
        
        .workflow-canvas .react-flow__edge.selected .react-flow__edge-path {
          stroke: #8b5cf6;
          stroke-width: 3;
        }
        
        @keyframes dashdraw {
          to {
            stroke-dashoffset: -10;
          }
        }
        
        .react-flow__attribution {
          opacity: 0.3;
        }
      `}</style>
    </div>
  );
}
