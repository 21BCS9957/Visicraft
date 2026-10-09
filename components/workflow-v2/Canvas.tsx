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
  EdgeChange,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ImportNode } from './nodes/ImportNode';
import { PromptNode } from './nodes/PromptNode';
import { GenerateNode } from './nodes/GenerateNode';
import { VideoGenerateNode } from './nodes/VideoGenerateNode';
import { OutputNode } from './nodes/OutputNode';
import { NoteNode } from './nodes/NoteNode';
import { CropNode } from './nodes/CropNode';
import { CustomEdge, PremiumConnectionLine } from './CustomEdge';
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
import { MousePointer2, Lightbulb, Sparkles, Pencil, Combine } from 'lucide-react';
import { NodeSelectorMenu } from './NodeSelectorMenu';
import { CanvasOnboarding } from './CanvasOnboarding';

const nodeTypes = {
  import: ImportNode,
  prompt: PromptNode,
  generate: GenerateNode,
  videoGenerate: VideoGenerateNode,
  output: OutputNode,
  note: NoteNode,
  crop: CropNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const defaultEdgeOptions = {
  type: 'custom',
  animated: false,
  style: {
    strokeWidth: 3.25,
    stroke: '#38bdf8',
  },
};

const proOptions = { hideAttribution: true };
const ONBOARDING_STORAGE_KEY = 'visicraft-workflow-onboarding-dismissed';

const createWorkflowEdge = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string
): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle,
  type: 'custom',
  animated: false,
  style: { strokeWidth: 2.75 },
});

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
  const { credits, refreshCredits } = useCredits();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const {
    undo,
    redo,
    canUndo,
    canRedo,
    trackChanges,
    clearHistory
  } = useUndoRedo([], [], setNodes, setEdges);

  useEffect(() => {
    if (canvasReady) trackChanges(nodes, edges);
  }, [nodes, edges, trackChanges, canvasReady]);

  const isGenerationRunning = React.useMemo(
    () => nodes.some((n) => {
      const data = n.data as { status?: unknown };
      return (n.type === 'generate' || n.type === 'videoGenerate') && data.status === 'processing';
    }),
    [nodes]
  );
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize] = useState(20);
  const [gridVariant, setGridVariant] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [showFilePanel, setShowFilePanel] = useState(false);
  const isMobile = useIsMobile();
  
  const [menuPosition, setMenuPosition] = useState<{ x: number, y: number, screenX: number, screenY: number } | null>(null);

  const isInitialLoadRef = useRef(true);
  const lastPaneClickTimeRef = useRef(0);
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // updateNodeData: updates React state and ref so latest is available before next render
  const updateNodeData = useCallback((nodeId: string, newData: Record<string, unknown>) => {
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
    const t = window.setTimeout(() => {
      isInitialLoadRef.current = false;
      clearHistory(nodesRef.current, edgesRef.current);
      setCanvasReady(true);
      toast.success('Blank canvas ready!');
    }, 150);
    return () => window.clearTimeout(t);
  }, [clearHistory]);

  useEffect(() => {
    if (!canvasReady || typeof window === 'undefined') return;
    if (window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true') return;

    const frame = window.requestAnimationFrame(() => setShowOnboarding(true));
    return () => window.cancelAnimationFrame(frame);
  }, [canvasReady]);

  // Custom edge change handler to clear node data when edges are deleted
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
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
        style: { strokeWidth: 3.25 },
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

            const sourceImageUrl =
              sourceNode.data.supabaseUrl ||
              sourceNode.data.imageUrl ||
              sourceNode.data.generatedImage ||
              sourceNode.data.generatedVideo;

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
      await executeWorkflow(
        latestNodes as Parameters<typeof executeWorkflow>[0],
        latestEdges as Parameters<typeof executeWorkflow>[1],
        {
          updateNodeData,
          credits,
          refreshCredits,
        }
      );
      toast.success('Workflow completed!', { id: 'workflow' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Workflow failed';
      toast.error(msg, { id: 'workflow' });
    }
  };

  const nodeColor = useCallback((node: Node) => {
    // Return transparent since CustomMiniMapNode handles all visual rendering
    return 'transparent';
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

  const handleAddPreset = useCallback((presetType: string) => {
    const wrapper = reactFlowWrapper.current;
    const center = reactFlowInstance.project({
      x: wrapper ? wrapper.clientWidth / 2 : 400,
      y: wrapper ? wrapper.clientHeight / 2 : 300,
    });
    const presetId = `${presetType}-${Date.now()}`;
    const fitPreset = () => window.setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.25, duration: 400 });
    }, 50);

    if (presetType === 'prompt_idea') {
      handleAddNode('prompt', { x: center.x - 125, y: center.y - 75 });
    } else if (presetType === 'animate_image') {
      const importId = `import-${presetId}`;
      const promptId = `prompt-${presetId}`;
      const videoId = `videoGenerate-${presetId}`;
      const nextNodes: Node[] = [
        { id: importId, type: 'import', position: { x: center.x - 420, y: center.y - 160 }, data: { nodeType: 'reference' } },
        { id: promptId, type: 'prompt', position: { x: center.x - 420, y: center.y + 160 }, data: {} },
        { id: videoId, type: 'videoGenerate', position: { x: center.x + 60, y: center.y }, data: {} },
      ];
      const nextEdges = [
        createWorkflowEdge(`edge-${presetId}-reference`, importId, videoId, 'image', 'referenceImage'),
        createWorkflowEdge(`edge-${presetId}-prompt`, promptId, videoId, 'prompt', 'prompt'),
      ];
      setNodes((nds) => [...nds, ...nextNodes]);
      setEdges((eds) => [...eds, ...nextEdges]);
      fitPreset();
      toast.success('Animate image workflow added');
    } else if (presetType === 'edit_image') {
      const importId = `import-${presetId}`;
      const promptId = `prompt-${presetId}`;
      const generateId = `generate-${presetId}`;
      const nextNodes: Node[] = [
        { id: importId, type: 'import', position: { x: center.x - 420, y: center.y - 160 }, data: { nodeType: 'reference' } },
        { id: promptId, type: 'prompt', position: { x: center.x - 420, y: center.y + 160 }, data: {} },
        { id: generateId, type: 'generate', position: { x: center.x + 60, y: center.y }, data: {} },
      ];
      const nextEdges = [
        createWorkflowEdge(`edge-${presetId}-reference`, importId, generateId, 'image', 'referenceImage'),
        createWorkflowEdge(`edge-${presetId}-prompt`, promptId, generateId, 'prompt', 'prompt'),
      ];
      setNodes((nds) => [...nds, ...nextNodes]);
      setEdges((eds) => [...eds, ...nextEdges]);
      fitPreset();
      toast.success('Edit image workflow added');
    } else if (presetType === 'merge_styles') {
      const referenceId = `import-reference-${presetId}`;
      const styleId = `import-style-${presetId}`;
      const promptId = `prompt-${presetId}`;
      const generateId = `generate-${presetId}`;
      const nextNodes: Node[] = [
        { id: referenceId, type: 'import', position: { x: center.x - 520, y: center.y - 220 }, data: { nodeType: 'reference' } },
        { id: styleId, type: 'import', position: { x: center.x - 520, y: center.y + 20 }, data: { nodeType: 'style' } },
        { id: promptId, type: 'prompt', position: { x: center.x - 140, y: center.y + 240 }, data: {} },
        { id: generateId, type: 'generate', position: { x: center.x + 240, y: center.y - 80 }, data: {} },
      ];
      const nextEdges = [
        createWorkflowEdge(`edge-${presetId}-reference`, referenceId, generateId, 'image', 'referenceImage'),
        createWorkflowEdge(`edge-${presetId}-style`, styleId, generateId, 'image', 'referenceImage'),
        createWorkflowEdge(`edge-${presetId}-prompt`, promptId, generateId, 'prompt', 'prompt'),
      ];
      setNodes((nds) => [...nds, ...nextNodes]);
      setEdges((eds) => [...eds, ...nextEdges]);
      fitPreset();
      toast.success('Merge styles workflow added');
    }
  }, [handleAddNode, reactFlowInstance, setEdges, setNodes]);

  const handleNewBlankCanvas = useCallback(() => {
    clearHistory([], []);
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    toast.success('New blank canvas');
  }, [clearHistory, setNodes, setEdges]);

  const closeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    }
  }, []);

  const handleCreateStarterFlow = useCallback(() => {
    if (nodesRef.current.length > 0) {
      handleNewBlankCanvas();
    }
    handleAddPreset('edit_image');
    closeOnboarding();
  }, [closeOnboarding, handleAddPreset, handleNewBlankCanvas]);

  const onPaneDoubleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!reactFlowBounds) return;

    // Get position in ReactFlow units
    const position = reactFlowInstance.project({
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    });

    setMenuPosition({
      x: position.x,
      y: position.y,
      screenX: event.clientX,
      screenY: event.clientY
    });
  }, [reactFlowInstance]);

  return (
    <WorkflowContext.Provider value={workflowContextValue}>
      <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#08080a] text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `
              linear-gradient(to right, #ffffff 1px, transparent 1px),
              linear-gradient(to bottom, #ffffff 1px, transparent 1px)
            `,
            backgroundSize: '4rem 4rem',
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_36%),linear-gradient(to_bottom,transparent,#08080a_82%)]" />
        <Topbar
          onNewWorkflow={handleNewBlankCanvas}
          onOpenOnboarding={() => setShowOnboarding(true)}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid(!showGrid)}
          gridVariant={gridVariant}
          onChangeGridVariant={setGridVariant}
          onOrganizeNodes={handleOrganizeNodes}
        />

        <div className="relative z-10 flex flex-1 overflow-hidden px-3 pb-[92px] pt-3">
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
            className="relative flex-1 overflow-hidden rounded-[28px] border border-white/8 bg-[#0b0b0d]/58 shadow-[0_28px_100px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl"
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
              onPaneClick={(event) => {
                const now = Date.now();
                if (now - lastPaneClickTimeRef.current < 300) {
                  onPaneDoubleClick(event);
                } else {
                  setMenuPosition(null);
                }
                lastPaneClickTimeRef.current = now;
              }}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              className="workflow-flow-canvas bg-transparent"
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
              elevateEdgesOnSelect={false}
              connectionLineStyle={{
                stroke: '#38bdf8',
                strokeWidth: 3.15,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
              }}
              connectionLineComponent={PremiumConnectionLine}
              connectionLineType={ConnectionLineType.Bezier}
              defaultViewport={{ x: 0, y: 0, zoom: isMobile ? 0.6 : 1 }}
            >
              {showGrid && (
                <Background
                  color="#ffffff"
                  gap={gridSize}
                  size={gridVariant === BackgroundVariant.Dots ? 1.5 : 1}
                  variant={gridVariant}
                  className="opacity-[0.14]"
                />
              )}

              {/* Zoom Controls */}
              <Controls
                className="!overflow-hidden !rounded-2xl !border !border-white/10 !bg-[#151519]/78 !shadow-[0_18px_60px_rgba(0,0,0,0.34)] !backdrop-blur-xl"
                style={{ position: 'absolute', bottom: isMobile ? 20 : 24, left: 24 }}
                showZoom={true}
                showFitView={true}
                showInteractive={false}
                fitViewOptions={{ padding: 0.2, duration: 400 }}
              />

              {!isMobile && (
                <MiniMapWithEdges
                  nodeColor={nodeColor}
                  nodeComponent={CustomMiniMapNode}
                  maskColor="rgba(8, 8, 10, 0.88)"
                  className="!overflow-hidden !rounded-2xl !border !border-white/10 !bg-[#151519]/80 !shadow-[0_18px_70px_rgba(0,0,0,0.36)] !backdrop-blur-xl"
                  style={{ position: 'absolute', bottom: 24, right: 24 }}
                  zoomable={true}
                  pannable={true}
                />
              )}
            </ReactFlow>

            <CanvasOnboarding
              isOpen={showOnboarding}
              onClose={closeOnboarding}
              onCreateExample={handleCreateStarterFlow}
            />

            {/* Empty State Presets */}
            {nodes.length === 0 && canvasReady && !menuPosition && !showOnboarding && (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
                <div className="flex flex-col items-center gap-6">
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-light text-white/58 backdrop-blur-xl">
                    <MousePointer2 className="w-4 h-4" />
                    <span>Double-click to add a node, or start from a preset</span>
                  </div>
                  
                  <div className="pointer-events-auto grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { id: 'prompt_idea', icon: <Lightbulb className="w-4 h-4" />, title: 'Get prompt idea', desc: 'Quick prompt suggestions.' },
                      { id: 'animate_image', icon: <Sparkles className="w-4 h-4" />, title: 'Animate Image', desc: 'Add motion to your image.' },
                      { id: 'edit_image', icon: <Pencil className="w-4 h-4" />, title: 'Edit Image', desc: 'Modify visual elements.' },
                      { id: 'merge_styles', icon: <Combine className="w-4 h-4" />, title: 'Merge Styles', desc: 'Combine two artistic styles.' },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handleAddPreset(preset.id)}
                        className="workflow-preset-card group flex w-[240px] flex-col gap-1 rounded-[22px] border border-white/10 bg-[#151519]/74 p-4 text-left shadow-[0_18px_60px_rgba(0,0,0,0.30)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-[#fff05a]/32 hover:bg-white/[0.06]"
                      >
                        <div className="flex items-center gap-2 text-white font-medium text-[13px]">
                          <span className="text-[#fff05a] transition-colors">{preset.icon}</span>
                          {preset.title}
                        </div>
                        <div className="mt-[2px] text-[11px] font-normal leading-snug text-white/42">
                          {preset.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Node Selector Context Menu */}
            <NodeSelectorMenu
              isOpen={menuPosition !== null}
              position={menuPosition ? { x: menuPosition.screenX, y: menuPosition.screenY } : null}
              onClose={() => setMenuPosition(null)}
              onSelect={(type, nodeType) => {
                if (menuPosition) handleAddNode(type, { x: menuPosition.x, y: menuPosition.y }, nodeType);
              }}
            />
          </div>

          {!isMobile && (
            <PropertiesPanel
              selectedNode={selectedNode?.id ? reactFlowInstance.getNode(selectedNode.id) ?? selectedNode : null}
              onClose={() => setSelectedNode(null)}
            />
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
          <RunControls onRun={handleRun} isRunning={isGenerationRunning} />
        </div>
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
