'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactFlow, {
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  ConnectionLineType,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ImportNode } from './nodes/ImportNode';
import { PromptNode } from './nodes/PromptNode';
import { GenerateNode } from './nodes/GenerateNode';
import { OutputNode } from './nodes/OutputNode';
import UnifiedEdge from './edges/UnifiedEdge';
import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { Topbar } from './Topbar';
import { RunControls } from './RunControls';
import { executeWorkflow } from '@/lib/workflow/executor';
import { loadTemplate } from '@/lib/workflow/templateLoader';
import TemplateSelectionModal from './TemplateSelectionModal';
import toast from 'react-hot-toast';

const nodeTypes = {
  import: ImportNode,
  prompt: PromptNode,
  generate: GenerateNode,
  output: OutputNode,
};

const edgeTypes = {
  default: UnifiedEdge,
};

const defaultEdgeOptions = {
  type: 'default',
  animated: false,
  style: { strokeWidth: 2.5 },
};

const proOptions = { hideAttribution: true };

// Mobile detection hook
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

function FlowCanvas() {
  const searchParams = useSearchParams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize] = useState(20);
  const [gridVariant, setGridVariant] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [showFilePanel, setShowFilePanel] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!templateLoaded) {
      const template = searchParams.get('template') || 'custom';
      const { nodes: templateNodes, edges: templateEdges } = loadTemplate(template);
      setNodes(templateNodes);
      setEdges(templateEdges);
      setTemplateLoaded(true);
      setHasUnsavedChanges(false); // Reset unsaved changes on initial load
      
      const templateName = template === 'custom' 
        ? 'Blank canvas ready!' 
        : `${template.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} template loaded!`;
      toast.success(templateName);
    }
  }, [searchParams, templateLoaded, setNodes, setEdges]);

  // Connection validation
  const isValidConnection = useCallback((connection: Connection) => {
    // Prevent self-connections
    if (connection.source === connection.target) return false;
    
    // Prevent duplicate connections
    const exists = edges.some(
      edge =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        edge.sourceHandle === connection.sourceHandle &&
        edge.targetHandle === connection.targetHandle
    );
    
    return !exists;
  }, [edges]);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        id: `edge-${Date.now()}`,
        ...params,
        source: params.source!,
        target: params.target!,
        type: 'default',
        animated: false,
        style: { strokeWidth: 2.5 },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      setHasUnsavedChanges(true);
      
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

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    // Only open properties panel for Generate nodes that aren't currently generating
    if (node.type === 'generate' && node.data.status !== 'generating') {
      setSelectedNode(node);
    } else if (node.type !== 'generate') {
      setSelectedNode(node);
    }
  }, []);

  const handleAddNode = useCallback((type: string, position: { x: number; y: number }, nodeType?: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: nodeType ? { nodeType } : {},
    };
    setNodes((nds) => [...nds, newNode]);
    setHasUnsavedChanges(true);
    
    // Auto-zoom to fit new node
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
    }, 50);
  }, [setNodes, reactFlowInstance]);

  // Handle drag and drop from sidebar
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow-type');
      const nodeType = event.dataTransfer.getData('application/reactflow-nodetype');

      if (!type) return;

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      handleAddNode(type, position, nodeType || undefined);
      toast.success('Node added!');
    },
    [reactFlowInstance, handleAddNode]
  );

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
      toast.error(error instanceof Error ? error.message : 'Workflow failed', { id: 'workflow' });
    } finally {
      setIsRunning(false);
    }
  };

  const nodeColor = useCallback((node: Node) => {
    switch (node.type) {
      case 'generate': return '#ef4444';
      case 'import': return '#3b82f6';
      case 'prompt': return '#8b5cf6';
      default: return '#666666';
    }
  }, []);

  const handleOrganizeNodes = useCallback(() => {
    const nodeWidth = 250;
    const nodeHeight = 150;
    const padding = 50;
    
    setNodes((nds) => nds.map((node, index) => ({
      ...node,
      position: {
        x: (index % 4) * (nodeWidth + padding) + padding,
        y: Math.floor(index / 4) * (nodeHeight + padding) + padding,
      },
    })));
    toast.success('Nodes organized!');
  }, [setNodes]);

  const handleSelectTemplate = useCallback((templateId: string) => {
    // Load template directly - no confirmation needed when explicitly selecting from modal
    const { nodes: templateNodes, edges: templateEdges } = loadTemplate(templateId);
    setNodes(templateNodes);
    setEdges(templateEdges);
    setHasUnsavedChanges(false);
    setShowTemplateModal(false);
    
    const templateName = templateId === 'custom' 
      ? 'Blank canvas ready!' 
      : `${templateId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} template loaded!`;
    toast.success(templateName);
    
    // Fit view after loading template
    setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
    }, 100);
  }, [setNodes, setEdges, reactFlowInstance]);

  return (
    <div className="w-full h-screen flex flex-col bg-black">
      <Topbar 
        onNewWorkflow={() => setShowTemplateModal(true)}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(!showGrid)}
        gridVariant={gridVariant}
        onChangeGridVariant={setGridVariant}
        onOrganizeNodes={handleOrganizeNodes}
      />
      
      <TemplateSelectionModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSelectTemplate={handleSelectTemplate}
      />
      
      <div className="flex-1 flex relative overflow-hidden">
        <Sidebar 
          onAddNode={handleAddNode}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid(!showGrid)}
          showFilePanel={showFilePanel}
          onToggleFilePanel={() => setShowFilePanel(!showFilePanel)}
        />
        
        <div 
          ref={reactFlowWrapper} 
          className="flex-1 relative"
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
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
            isValidConnection={isValidConnection}
            nodesDraggable
            nodesConnectable
            elementsSelectable
            selectNodesOnDrag={false}
            panOnDrag={isMobile ? [1, 2] : true}
            panOnScroll={!isMobile}
            zoomOnScroll={true}
            zoomOnPinch={true}
            zoomOnDoubleClick={true}
            minZoom={0.1}
            maxZoom={4}
            onlyRenderVisibleElements={false}
            nodeOrigin={[0.5, 0.5]}
            elevateNodesOnSelect={false}
            elevateEdgesOnSelect={true}
            connectionLineStyle={{ stroke: '#8b7355', strokeWidth: 2.5 }}
            connectionLineType={ConnectionLineType.Bezier}
            defaultViewport={{ x: 0, y: 0, zoom: isMobile ? 0.6 : 1 }}
          >
            {showGrid && (
              <Background
                color="#ffffff"
                gap={gridSize}
                size={gridVariant === BackgroundVariant.Dots ? 1.5 : 1}
                variant={gridVariant}
                className="opacity-20"
              />
            )}
            
            {/* Zoom Controls */}
            <Controls 
              className="!bg-[#0a0a0a] !border !border-[#2a2a2a] !rounded-lg"
              style={{ position: 'absolute', bottom: isMobile ? 20 : 100, left: 24 }}
              showZoom={true}
              showFitView={true}
              showInteractive={false}
              fitViewOptions={{ padding: 0.2, duration: 400 }}
            />
            
            {!isMobile && (
              <MiniMap
                nodeColor={nodeColor}
                maskColor="rgba(0, 0, 0, 0.9)"
                className="!bg-[#0a0a0a] !border !border-[#2a2a2a] !rounded-lg"
                style={{ position: 'absolute', bottom: 100, right: 24 }}
              />
            )}
          </ReactFlow>
        </div>
        
        {!isMobile && (
          <PropertiesPanel selectedNode={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
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
