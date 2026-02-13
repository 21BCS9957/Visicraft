'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
import { NoteNode } from './nodes/NoteNode';
import { CustomEdge } from './CustomEdge';
import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { Topbar } from './Topbar';
import { WorkflowContext } from './WorkflowContext';
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize] = useState(20);
  const [gridVariant, setGridVariant] = useState<BackgroundVariant>(BackgroundVariant.Dots);
  const [showFilePanel, setShowFilePanel] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const hasShownToast = useRef(false);
  const isMobile = useIsMobile();

  // Get current template early so it can be used in effects
  const currentTemplate = searchParams.get('template') || 'custom';

  // Track if we're in the initial load phase (to skip auto-save during template load)
  const isInitialLoadRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Refs to always have latest nodes/edges for saving on template switch (avoids getNodes() being out of sync)
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);

  // Keep refs in sync (for save on template switch)
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // updateNodeData: directly updates React state (bypasses React Flow's internal store)
  const updateNodeData = useCallback((nodeId: string, newData: Record<string, any>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...newData } }
          : node
      )
    );
  }, [setNodes]);

  // Context value for child nodes to update data through Canvas's React state
  const workflowContextValue = React.useMemo(() => ({
    updateNodeData,
    setNodes,
    setEdges,
  }), [updateNodeData, setNodes, setEdges]);

  // Auto-save workflow to localStorage with template-specific key
  // This runs whenever nodes or edges change after template is loaded
  useEffect(() => {
    // Skip save during initial template load
    if (!templateLoaded || isInitialLoadRef.current) {
      return;
    }

    // Debounce saves to avoid excessive writes
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      try {
        // Use nodesRef (synced from React state every render) — now correct since
        // child nodes update via context → Canvas's setNodes → React state
        const latestNodes = nodesRef.current;
        const latestEdges = edgesRef.current;
        
        const workflowData = {
          nodes: latestNodes,
          edges: latestEdges,
          timestamp: Date.now(),
          template: currentTemplate,
        };
        const saveKey = `workflow-autosave-${currentTemplate}`;
        localStorage.setItem(saveKey, JSON.stringify(workflowData));

        // Logging
        const importNodes = latestNodes.filter(n => n.type === 'import');
        const promptNodes = latestNodes.filter(n => n.type === 'prompt');
        console.log('[SAVE] Auto-saved to localStorage', {
          template: currentTemplate,
          saveKey,
          totalNodes: latestNodes.length,
          importHasUrl: importNodes.map(n => !!n.data?.supabaseUrl),
          promptHasText: promptNodes.map(n => !!(n.data?.text && n.data.text.length > 0)),
        });
      } catch (error) {
        console.error('❌ Auto-save failed:', error);
      }
    }, 500); // 500ms debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, edges, templateLoaded, currentTemplate]);

  // When template query param changes: save previous template, then clear and mark for reload.
  // Save from closure (nodes, edges) not refs - refs can be stale when effect runs after router update.
  const prevTemplateRef = useRef(currentTemplate);

  useEffect(() => {
    if (prevTemplateRef.current !== currentTemplate) {
      const fromTemplate = prevTemplateRef.current;
      console.log('[SWITCH] Template param changed (effect)', {
        from: fromTemplate,
        to: currentTemplate,
        action: 'flush-save previous, clear canvas, set templateLoaded=false',
        nodesInClosure: nodes.length,
        edgesInClosure: edges.length,
      });

      // CRITICAL: Cancel pending auto-save and save immediately with latest data from React Flow
      // The closure's nodes/edges may be stale if user just typed/uploaded before clicking
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        console.log('[SWITCH] Cancelled pending auto-save');
      }

      // Flush-save: use nodesRef (synced from React state) since child nodes now update via context
      try {
        const latestNodes = nodesRef.current;
        const latestEdges = edgesRef.current;
        
        if (latestNodes.length > 0 && !isInitialLoadRef.current) {
          const saveKey = `workflow-autosave-${fromTemplate}`;
          
          // Log ACTUAL data we're about to save
          const importNodesFlush = latestNodes.filter(n => n.type === 'import');
          const promptNodesFlush = latestNodes.filter(n => n.type === 'prompt');
          console.log('[SWITCH] About to save - inspecting nodes (from refs):', {
            template: fromTemplate,
            nodeCount: latestNodes.length,
            importNodes: importNodesFlush.map(n => ({
              id: n.id,
              supabaseUrl: n.data?.supabaseUrl?.substring(0, 50) || 'NONE',
              supabaseUrlLen: n.data?.supabaseUrl?.length ?? 0,
            })),
            promptNodes: promptNodesFlush.map(n => ({
              id: n.id,
              text: n.data?.text?.substring(0, 50) || 'NONE',
              textLen: n.data?.text?.length ?? 0,
            })),
          });
          
          localStorage.setItem(saveKey, JSON.stringify({
            nodes: latestNodes,
            edges: latestEdges,
            timestamp: Date.now(),
            template: fromTemplate,
          }));
          
          console.log('[SWITCH] Flush-saved before clear (from refs)', {
            template: fromTemplate,
            nodeCount: latestNodes.length,
            importSupabaseLens: importNodesFlush.map(n => n.data?.supabaseUrl?.length ?? 0),
            promptTextLens: promptNodesFlush.map(n => n.data?.text?.length ?? 0),
          });
        } else {
          console.log('[SWITCH] Skipping save:', {
            nodesLength: latestNodes.length,
            isInitialLoad: isInitialLoadRef.current,
          });
        }
      } catch (e) {
        console.error('[SWITCH] Flush-save failed', e);
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      setNodes([]);
      setEdges([]);

      prevTemplateRef.current = currentTemplate;
      setTemplateLoaded(false);
      hasShownToast.current = false;
      isInitialLoadRef.current = true;
    }
  }, [currentTemplate, setNodes, setEdges, nodes, edges]);

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
              if (node.id === edge.target && node.type === 'generate') {
                const updatedData = { ...node.data };

                // Clear the specific handle data
                if (edge.targetHandle === 'referenceImage') {
                  delete updatedData.referenceImageUrl;
                } else if (edge.targetHandle === 'sourceImage') {
                  delete updatedData.sourceImageUrl;
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

  useEffect(() => {
    const template = currentTemplate; // Use the stable currentTemplate value
    console.log('[LOAD] Effect ran', { template, templateLoaded });
    if (templateLoaded) {
      console.log('[LOAD] Skipping — templateLoaded is true');
      return;
    }

    let templateData;

    // Try to restore saved workflow
    try {
      const saveKey = `workflow-autosave-${template}`;
      const saved = localStorage.getItem(saveKey);

      console.log('[LOAD] Reading localStorage', {
        template,
        saveKey,
        hasSavedData: !!saved,
        savedDataLength: saved?.length ?? 0,
      });

      if (saved) {
        const savedData = JSON.parse(saved);
        const isRecent = Date.now() - savedData.timestamp < 24 * 60 * 60 * 1000;

        if (savedData.template === template && isRecent && savedData.nodes.length > 0) {
          templateData = {
            nodes: savedData.nodes,
            edges: savedData.edges,
            viewport: savedData.viewport || null,
          };

          // Detailed restore logging
          const importNodes = savedData.nodes.filter((n: Node) => n.type === 'import');
          const promptNodes = savedData.nodes.filter((n: Node) => n.type === 'prompt');
          const impSupabaseLens = importNodes.map((n: Node) => (n.data?.supabaseUrl as string)?.length ?? 0);
          const promptTextLens = promptNodes.map((n: Node) => (n.data?.text as string)?.length ?? 0);
          console.log('[LOAD] Restored from localStorage', {
            template,
            saveKey,
            totalNodes: savedData.nodes.length,
            importSupabaseUrlLengths: impSupabaseLens,
            promptTextLengths: promptTextLens,
            importNodesData: importNodes.map((n: Node) => ({
              id: n.id,
              dataKeys: Object.keys(n.data || {}),
              hasSupabaseUrl: !!n.data?.supabaseUrl,
              supabaseUrlLen: (n.data?.supabaseUrl as string)?.length ?? 0,
              hasImageUrl: !!n.data?.imageUrl,
              supabaseUrlFirst80: (n.data?.supabaseUrl as string)?.substring(0, 80) ?? null,
            })),
            promptNodesData: promptNodes.map((n: Node) => ({
              id: n.id,
              dataKeys: Object.keys(n.data || {}),
              textLen: (n.data?.text as string)?.length ?? 0,
              textPreview: (n.data?.text as string)?.substring(0, 80) ?? null,
            })),
          });
          if (impSupabaseLens.some((L: number) => L > 0) || promptTextLens.some((L: number) => L > 0)) {
            console.log('[LOAD] ✅ Restored data HAS image/prompt:', { importSupabaseUrlLengths: impSupabaseLens, promptTextLengths: promptTextLens });
          } else {
            console.warn('[LOAD] ⚠️ Restored data has NO image/prompt:', { importSupabaseUrlLengths: impSupabaseLens, promptTextLengths: promptTextLens });
          }
        } else {
          console.log('[LOAD] Not restoring', {
            template,
            reason: !isRecent ? 'too old' : savedData.template !== template ? 'template mismatch' : 'empty nodes',
            savedTemplate: savedData.template,
            isRecent,
            nodesLength: savedData.nodes?.length ?? 0,
          });
        }
      }
    } catch (error) {
      console.error('❌ Restore failed:', error);
    }

    // Load fresh template if no saved data
    if (!templateData) {
      console.log('[LOAD] Using fresh template from JSON', { template });
      templateData = loadTemplate(template);
    }

    const importApplied = templateData.nodes.filter((n: Node) => n.type === 'import');
    const promptApplied = templateData.nodes.filter((n: Node) => n.type === 'prompt');
    console.log('[LOAD] Applying to canvas', {
      template,
      nodesCount: templateData.nodes.length,
      edgesCount: templateData.edges.length,
      importNodesApplied: importApplied.map((n: Node) => ({
        id: n.id,
        dataKeys: Object.keys(n.data || {}),
        hasSupabaseUrl: !!n.data?.supabaseUrl,
        supabaseUrlLen: (n.data?.supabaseUrl as string)?.length ?? 0,
      })),
      promptNodesApplied: promptApplied.map((n: Node) => ({
        id: n.id,
        textLen: (n.data?.text as string)?.length ?? 0,
      })),
    });
    setNodes(templateData.nodes);
    setEdges(templateData.edges);

    // Initialize generate node connections
    if (templateData.edges.length > 0) {
      setTimeout(() => {
        setNodes((nds) =>
          nds.map(node => {
            if (node.type !== 'generate') return node;

            const updatedNode = { ...node, data: { ...node.data } };

            templateData.edges.forEach((edge: Edge) => {
              if (edge.target === node.id) {
                const sourceNode = templateData.nodes.find((n: Node) => n.id === edge.source);
                if (!sourceNode) return;

                if (edge.targetHandle === 'prompt' && sourceNode.data.text) {
                  updatedNode.data.promptText = sourceNode.data.text;
                } else if (edge.targetHandle === 'referenceImage' && sourceNode.data.supabaseUrl) {
                  updatedNode.data.referenceImageUrl = sourceNode.data.supabaseUrl;
                } else if (edge.targetHandle === 'sourceImage' && sourceNode.data.supabaseUrl) {
                  updatedNode.data.sourceImageUrl = sourceNode.data.supabaseUrl;
                }
              }
            });

            return updatedNode;
          })
        );
      }, 100);
    }

    if (templateData.viewport) {
      setTimeout(() => reactFlowInstance.setViewport(templateData.viewport!), 100);
    }

    setTemplateLoaded(true);

    // Allow auto-save after a short delay (after initial setup is complete)
    setTimeout(() => {
      isInitialLoadRef.current = false;
    }, 1000);

    if (!hasShownToast.current) {
      const templateName = template === 'custom'
        ? 'Blank canvas ready!'
        : `${template.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} template loaded!`;
      toast.success(templateName);
      hasShownToast.current = true;
    }
  }, [currentTemplate, templateLoaded, setNodes, setEdges, reactFlowInstance]);

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

          if (updatedNode.type === 'generate') {
            const handleId = params.targetHandle;

            // Check for both supabaseUrl (uploaded) and imageUrl (template example)
            const sourceImageUrl = sourceNode.data.supabaseUrl || sourceNode.data.imageUrl;

            if (handleId === 'referenceImage' && sourceImageUrl) {
              updatedNode.data.referenceImageUrl = sourceImageUrl;
            } else if (handleId === 'sourceImage' && sourceImageUrl) {
              updatedNode.data.sourceImageUrl = sourceImageUrl;
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

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Don't open properties panel if clicking on an image or interactive element
    const target = event.target as HTMLElement;
    if (target.tagName === 'IMG' || target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }

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
    const templateWeAreLeaving = searchParams.get('template') || 'custom';
    // Use refs so we save the actual React state (getNodes() can be out of sync in controlled mode)
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;

    const importNodesClick = currentNodes.filter(n => n.type === 'import');
    const promptNodesClick = currentNodes.filter(n => n.type === 'prompt');
    console.log('[SWITCH] User clicked template in modal', {
      selectedTemplateId: templateId,
      leavingTemplate: templateWeAreLeaving,
      nodesCount: currentNodes.length,
      importNodesData: importNodesClick.map(n => ({
        id: n.id,
        dataKeys: Object.keys(n.data || {}),
        hasSupabaseUrl: !!n.data?.supabaseUrl,
        supabaseUrlLen: n.data?.supabaseUrl?.length ?? 0,
      })),
      promptNodesData: promptNodesClick.map(n => ({
        id: n.id,
        dataKeys: Object.keys(n.data || {}),
        textLen: n.data?.text?.length ?? 0,
      })),
    });

    // 1. Save current template so when we come back we restore it (including uploaded image)
    if (currentNodes.length > 0 && !isInitialLoadRef.current) {
      try {
        const saveKey = `workflow-autosave-${templateWeAreLeaving}`;
        localStorage.setItem(saveKey, JSON.stringify({
          nodes: currentNodes,
          edges: currentEdges,
          timestamp: Date.now(),
          template: templateWeAreLeaving,
        }));
        console.log('[SWITCH] Saved before navigate', {
          template: templateWeAreLeaving,
          nodeCount: currentNodes.length,
          importHasSupabaseUrl: importNodesClick.some(n => !!n.data?.supabaseUrl),
          promptHasText: promptNodesClick.some(n => !!(n.data?.text && n.data.text.length > 0)),
        });
      } catch (e) {
        console.error('[SWITCH] Save before navigate failed', e);
      }
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setShowTemplateModal(false);

    // 2. Navigate via router so searchParams updates → effect runs → load effect restores or loads fresh
    router.replace(`/workflow?template=${templateId}`);
  }, [searchParams, router]);

  return (
    <WorkflowContext.Provider value={workflowContextValue}>
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
