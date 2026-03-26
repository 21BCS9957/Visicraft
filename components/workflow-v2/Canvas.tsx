'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReactFlow, {
  Background,
  BackgroundVariant,
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
import { VideoGenerateNode } from './nodes/VideoGenerateNode';
import { OutputNode } from './nodes/OutputNode';
import { NoteNode } from './nodes/NoteNode';
import { CustomEdge } from './CustomEdge';
import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { Topbar } from './Topbar';
import { WorkflowContext } from './WorkflowContext';
import { RunControls } from './RunControls';
import { executeWorkflow } from '@/lib/workflow/executor';
import { CustomMiniMapNode } from './CustomMiniMapNode';
import { MiniMapWithEdges } from './MiniMapEdgeOverlay';
import toast from '@/lib/toast';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCredits } from '@/lib/contexts/CreditsContext';
import { useUndoRedo } from './useUndoRedo';

const nodeTypes = {
  import: ImportNode,
  prompt: PromptNode,
  generate: GenerateNode,
  videoGenerate: VideoGenerateNode,
  output: OutputNode,
  note: NoteNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const defaultEdgeOptions = {
  type: 'custom',
  animated: false,
  style: {
    strokeWidth: 2.5,
    stroke: '#06b6d4',
  },
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
  const router = useRouter();
  const { user } = useAuth();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();
  const { credits, deductCredits, addCredits, refreshCredits } = useCredits();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  const {
    undo,
    redo,
    canUndo,
    canRedo,
    takeSnapshot,
    trackChanges,
    clearHistory
  } = useUndoRedo([], [], setNodes, setEdges);

  useEffect(() => {
    if (canvasReady) trackChanges(nodes, edges);
  }, [nodes, edges, trackChanges, canvasReady]);

  const isGenerationRunning = React.useMemo(
    () => nodes.some((n) => (n.type === 'generate' || n.type === 'videoGenerate') && (n.data as any)?.status === 'processing'),
    [nodes]
  );
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize] = useState(20);
  const [gridVariant, setGridVariant] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [showFilePanel, setShowFilePanel] = useState(false);
  const isMobile = useIsMobile();

  const isInitialLoadRef = useRef(true);
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);

  nodesRef.current = nodes;
  edgesRef.current = edges;

  // updateNodeData: updates React state and ref so latest is available before next render
  const updateNodeData = useCallback((nodeId: string, newData: Record<string, any>) => {
    setNodes((nds) => {
      const next = nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...newData } }
          : node
      );
      nodesRef.current = next;
      return next;
    });
  }, [setNodes]);

  const workflowContextValue = React.useMemo(
    () => ({
      updateNodeData,
      setNodes,
      setEdges,
      getLatestNodes: () => nodesRef.current,
      getLatestEdges: () => edgesRef.current,
      isGenerationRunning,
    }),
    [updateNodeData, setNodes, setEdges, isGenerationRunning]
  );

  useEffect(() => {
    isInitialLoadRef.current = true;
    clearHistory([], []);
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    const t = window.setTimeout(() => {
      isInitialLoadRef.current = false;
      clearHistory(nodesRef.current, edgesRef.current);
      setCanvasReady(true);
      toast.success('Blank canvas ready!');
    }, 150);
    return () => window.clearTimeout(t);
  }, [setNodes, setEdges, clearHistory]);

  // Custom edge change handler to clear node data when edges are deleted
  const onEdgesChange = useCallback((changes: any[]) => {
    // Handle edge deletions
    changes.forEach(change => {
      if (change.type === 'remove') {
        const edge = edges.find(e => e.id === change.id);
        if (edge && edge.target) {
          // Clear the data in the target node
          setNodes((nds) =>
            nds.map((node) => {
              if (node.id === edge.target && (node.type === 'generate' || node.type === 'videoGenerate')) {
                const updatedData = { ...node.data };

                // Clear the specific handle data
                if (edge.targetHandle === 'referenceImage') {
                  delete updatedData.referenceImageUrl;
                } else if (edge.targetHandle === 'prompt') {
                  delete updatedData.promptText;
                }

                return { ...node, data: updatedData };
              }
              return node;
            })
          );
        }
      }
    });

    // Call the base handler
    onEdgesChangeBase(changes);
  }, [edges, setNodes, onEdgesChangeBase]);

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        id: `edge-${Date.now()}`,
        ...params,
        source: params.source!,
        target: params.target!,
        type: 'custom',
        animated: false,
        style: { strokeWidth: 2 },
      };
      setEdges((eds) => addEdge(newEdge, eds));

      setNodes((nds) => {
        const sourceNode = nds.find(n => n.id === params.source);
        const targetNode = nds.find(n => n.id === params.target);

        if (!sourceNode || !targetNode) return nds;

        return nds.map(node => {
          if (node.id !== params.target) return node;

          const updatedNode = { ...node, data: { ...node.data } };

          if (updatedNode.type === 'generate' || updatedNode.type === 'videoGenerate') {
            const handleId = params.targetHandle;

            const sourceImageUrl = sourceNode.data.supabaseUrl || sourceNode.data.imageUrl || sourceNode.data.generatedImage;

            if (handleId === 'referenceImage' && sourceImageUrl) {
              updatedNode.data.referenceImageUrl = sourceImageUrl;
            } else if (handleId === 'prompt' && sourceNode.data.text) {
              updatedNode.data.promptText = sourceNode.data.text;
            }
          }

          if (sourceNode.type === 'generate' && updatedNode.type === 'output') {
            if (sourceNode.data.generatedImage) {
              updatedNode.data.images = [sourceNode.data.generatedImage];
            }
          }

          if (sourceNode.type === 'videoGenerate' && updatedNode.type === 'output') {
            if (sourceNode.data.generatedVideo) {
              updatedNode.data.images = [sourceNode.data.generatedVideo];
            }
          }

          return updatedNode;
        });
      });
    },
    [setEdges, setNodes]
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Don't open properties panel if clicking on an image or interactive element
    const target = event.target as HTMLElement;
    if (target.tagName === 'IMG' || target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }

    const isGenType = node.type === 'generate' || node.type === 'videoGenerate';
    if (isGenType && node.data.status !== 'generating') {
      setSelectedNode(node);
    } else if (!isGenType) {
      setSelectedNode(node);
    }
  }, []);

  const handleAddNode = useCallback((type: string, position: { x: number; y: number }, nodeType?: string) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: type === 'import' ? { nodeType: nodeType || 'reference' } : nodeType ? { nodeType } : {},
    };
    setNodes((nds) => [...nds, newNode]);

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
    if (!user) {
      router.push('/login?redirectTo=/workflow');
      return;
    }
    if (isGenerationRunning) {
      toast.error('A generation is already in progress');
      return;
    }
    const latestNodes = nodesRef.current;
    const latestEdges = edgesRef.current;
    if (latestNodes.length === 0) {
      toast.error('Add some nodes first');
      return;
    }

    try {
      toast.loading('Executing workflow...', { id: 'workflow' });
      await executeWorkflow(latestNodes as any, latestEdges, {
        updateNodeData: (nodeId, newData) => updateNodeData(nodeId, newData as Record<string, any>),
        credits,
        deductCredits,
        addCredits,
        refreshCredits,
      });
      toast.success('Workflow completed!', { id: 'workflow' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Workflow failed';
      toast.error(msg, { id: 'workflow' });
    }
  };

  const nodeColor = useCallback((node: Node) => {
    switch (node.type) {
      case 'generate': return '#ef4444';
      case 'videoGenerate': return '#a855f7';
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

  const handleNewBlankCanvas = useCallback(() => {
    clearHistory([], []);
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    toast.success('New blank canvas');
  }, [clearHistory, setNodes, setEdges]);

  return (
    <WorkflowContext.Provider value={workflowContextValue}>
      <div className="w-full h-screen flex flex-col bg-black">
        <Topbar
          onNewWorkflow={handleNewBlankCanvas}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid(!showGrid)}
          gridVariant={gridVariant}
          onChangeGridVariant={setGridVariant}
          onOrganizeNodes={handleOrganizeNodes}
        />

        <div className="flex-1 flex relative overflow-hidden">
          <Sidebar
            onAddNode={handleAddNode}
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid(!showGrid)}
            showFilePanel={showFilePanel}
            onToggleFilePanel={() => setShowFilePanel(!showFilePanel)}
            undo={undo}
            redo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
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
              connectionLineStyle={{
                stroke: '#06b6d4',
                strokeWidth: 3,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              }}
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
                <MiniMapWithEdges
                  nodeColor={nodeColor}
                  nodeComponent={CustomMiniMapNode}
                  maskColor="rgba(0, 0, 0, 0.9)"
                  className="!bg-[#0a0a0a] !border !border-[#2a2a2a] !rounded-lg overflow-hidden"
                  style={{ position: 'absolute', bottom: 100, right: 24 }}
                  zoomable={true}
                  pannable={true}
                />
              )}
            </ReactFlow>
          </div>

          {!isMobile && (
            <PropertiesPanel
              selectedNode={selectedNode?.id ? reactFlowInstance.getNode(selectedNode.id) ?? selectedNode : null}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </div>

        <RunControls onRun={handleRun} isRunning={isGenerationRunning} />
      </div>
    </WorkflowContext.Provider>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
