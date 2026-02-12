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
import { NoteNode } from './nodes/NoteNode';
import { CustomEdge } from './CustomEdge';
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [initialViewport, setInitialViewport] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const hasShownToast = useRef(false);
  const isMobile = useIsMobile();

  // Auto-save workflow to localStorage
  useEffect(() => {
    if (templateLoaded && hasUnsavedChanges && nodes.length > 0) {
      const saveTimeout = setTimeout(() => {
        try {
          const workflowData = {
            nodes,
            edges,
            timestamp: Date.now(),
            template: searchParams.get('template') || 'custom',
          };
          localStorage.setItem('workflow-autosave', JSON.stringify(workflowData));
          console.log('💾 Workflow auto-saved');
        } catch (error) {
          console.error('Failed to auto-save:', error);
        }
      }, 2000); // Save 2 seconds after last change

      return () => clearTimeout(saveTimeout);
    }
  }, [nodes, edges, hasUnsavedChanges, templateLoaded, searchParams]);

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
    if (!templateLoaded) {
      const template = searchParams.get('template') || 'custom';
      
      // Try to restore auto-saved workflow if it matches the current template
      let templateData;
      try {
        const saved = localStorage.getItem('workflow-autosave');
        if (saved) {
          const savedData = JSON.parse(saved);
          // Only restore if it's for the same template and less than 24 hours old
          const isRecent = Date.now() - savedData.timestamp < 24 * 60 * 60 * 1000;
          if (savedData.template === template && isRecent && savedData.nodes.length > 0) {
            templateData = {
              nodes: savedData.nodes,
              edges: savedData.edges,
              viewport: null,
            };
            console.log('📂 Restored auto-saved workflow');
            toast.success('Restored your last session!');
          }
        }
      } catch (error) {
        console.error('Failed to restore auto-save:', error);
      }
      
      // Load template if no auto-save was restored
      if (!templateData) {
        templateData = loadTemplate(template);
      }
      
      setNodes(templateData.nodes);
      setEdges(templateData.edges);
      
      // Initialize connections for pre-connected nodes in template
      if (templateData.edges.length > 0) {
        setTimeout(() => {
          setNodes((nds) => {
            return nds.map(node => {
              if (node.type !== 'generate') return node;
              
              const updatedNode = { ...node, data: { ...node.data } };
              
              // Find all edges connected to this generate node
              templateData.edges.forEach(edge => {
                if (edge.target === node.id) {
                  const sourceNode = templateData.nodes.find(n => n.id === edge.source);
                  if (!sourceNode) return;
                  
                  // For images: Only use supabaseUrl (user uploaded), not imageUrl (template example)
                  // For prompts: Always use the template text
                  if (edge.targetHandle === 'prompt' && sourceNode.data.text) {
                    updatedNode.data.promptText = sourceNode.data.text;
                  } else {
                    // Only initialize images if user has uploaded (has supabaseUrl)
                    const sourceImageUrl = sourceNode.data.supabaseUrl;
                    
                    if (edge.targetHandle === 'referenceImage' && sourceImageUrl) {
                      updatedNode.data.referenceImageUrl = sourceImageUrl;
                    } else if (edge.targetHandle === 'sourceImage' && sourceImageUrl) {
                      updatedNode.data.sourceImageUrl = sourceImageUrl;
                    }
                  }
                }
              });
              
              return updatedNode;
            });
          });
        }, 100);
      }
      
      // Set viewport if template has one
      if (templateData.viewport) {
        setInitialViewport(templateData.viewport);
        setTimeout(() => {
          reactFlowInstance.setViewport(templateData.viewport!);
        }, 100);
      }
      
      setTemplateLoaded(true);
      setHasUnsavedChanges(false); // Reset unsaved changes on initial load
      
      // Only show toast once (prevent duplicate in React Strict Mode)
      if (!hasShownToast.current) {
        const templateName = template === 'custom' 
          ? 'Blank canvas ready!' 
          : `${template.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} template loaded!`;
        toast.success(templateName);
        hasShownToast.current = true;
      }
    }
  }, [searchParams, templateLoaded, setNodes, setEdges, reactFlowInstance]);

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
    const templateData = loadTemplate(templateId);
    setNodes(templateData.nodes);
    setEdges(templateData.edges);
    setHasUnsavedChanges(false);
    setShowTemplateModal(false);
    
    const templateName = templateId === 'custom' 
      ? 'Blank canvas ready!' 
      : `${templateId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} template loaded!`;
    toast.success(templateName);
    
    // Apply viewport if template has one, otherwise fit view
    setTimeout(() => {
      if (templateData.viewport) {
        reactFlowInstance.setViewport(templateData.viewport);
      } else {
        reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
      }
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
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
