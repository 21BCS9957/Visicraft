'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Position, NodeProps, useReactFlow, NodeResizer } from 'reactflow';
import { MoreVertical, Upload, Image as ImageIcon, Copy, Trash2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadFileWithSignedUrl } from '@/lib/supabase/storage';
import toast from '@/lib/toast';
import { SmartHandle } from '../SmartHandle';
import { useWorkflow } from '../WorkflowContext';

export function ImportNode({ data, selected, id }: NodeProps) {
  const { getEdges, getNodes } = useReactFlow();
  const { updateNodeData, setNodes, setEdges } = useWorkflow();
  const [image, setImage] = useState<string | null>(data.supabaseUrl || data.imageUrl || null);
  const [imageLoading, setImageLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newImage = data.supabaseUrl || data.imageUrl || null;
    setImage(newImage);
    if (newImage) {
      setImageLoading(true);
    }
  }, [data.supabaseUrl, data.imageUrl]);

  const nodeLabel = 'Reference';

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const previewUrl = URL.createObjectURL(file);
      setImage(previewUrl);
      setImageLoading(true);
      updateNodeData(id, {
        imageUrl: null,
        uploaded: false,
        supabaseUrl: null,
      });
      const connectedReferenceEdges = getEdges().filter(
        (edge) => edge.source === id && edge.targetHandle === 'referenceImage'
      );
      connectedReferenceEdges.forEach((edge) => {
        updateNodeData(edge.target, { referenceImageUrl: null });
      });

      const url = await uploadFileWithSignedUrl(file, 'source-images');

      console.log('🔵 [ImportNode] Upload complete, updating via context:', {
        nodeId: id,
        supabaseUrl: url.substring(0, 50),
        urlLength: url.length,
      });

      // Update this node's data via Canvas's React state (NOT useReactFlow)
      updateNodeData(id, {
        imageUrl: null,
        uploaded: true,
        supabaseUrl: url,
      });

      // Update connected Generate nodes
      connectedReferenceEdges.forEach((edge) => {
        updateNodeData(edge.target, { referenceImageUrl: url });
      });

      toast.success('Image uploaded!');
    } catch (error) {
      setImage(null);
      setImageLoading(false);
      updateNodeData(id, {
        imageUrl: null,
        uploaded: false,
        supabaseUrl: null,
      });
      toast.error(error instanceof Error ? error.message : 'Upload failed');
      console.error(error);
    } finally {
      input.value = '';
      setUploading(false);
    }
  }, [id, updateNodeData, getEdges]);

  const handleDuplicate = () => {
    const nodes = getNodes();
    const edges = getEdges();
    const currentNode = nodes.find(n => n.id === id);

    if (!currentNode) return;

    // Create new node with offset position
    const newNode = {
      ...currentNode,
      id: `import-${Date.now()}`,
      position: {
        x: currentNode.position.x + 50,
        y: currentNode.position.y + 50,
      },
      data: { ...currentNode.data },
    };

    // Duplicate outgoing connections
    const outgoingEdges = edges.filter(e => e.source === id);
    const newEdges = outgoingEdges.map(edge => ({
      ...edge,
      id: `edge-${Date.now()}-${Math.random()}`,
      source: newNode.id,
    }));

    setNodes((nds) => [...nds, newNode]);
    setEdges((eds) => [...eds, ...newEdges]);
    toast.success('Node duplicated!');
    setShowMenu(false);
  };

  const handleReset = () => {
    setImage(null);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
            ...node,
            data: {
              ...node.data,
              imageUrl: null,
              uploaded: false,
              supabaseUrl: null,
            },
          }
          : node
      )
    );
    toast.success('Node reset!');
    setShowMenu(false);
  };

  const handleDelete = () => {
    // Remove node
    setNodes((nds) => nds.filter((node) => node.id !== id));

    // Remove connected edges
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));

    toast.success('Node deleted!');
    setShowMenu(false);
  };

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`
        group
        bg-[#1a1a1a]
        border-2 border-[#2a2a2a]
        rounded-2xl
        shadow-xl
        w-full
        h-full
        min-w-[320px]
        min-h-[250px]
        flex flex-col
        overflow-hidden
        transition-all
        ${selected ? 'ring-2 ring-blue-500/50 border-blue-500/30' : ''}
      `}
      style={{ cursor: 'default' }}
    >
      {/* Node Resizer */}
      <NodeResizer
        color="#3b82f6"
        isVisible={selected}
        minWidth={320}
        minHeight={250}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 4,
        }}
      />
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 16L8.586 11.414C9.367 10.633 10.633 10.633 11.414 11.414L16 16M14 14L15.586 12.414C16.367 11.633 17.633 11.633 18.414 12.414L20 14M14 8H14.01M6 20H18C19.105 20 20 19.105 20 18V6C20 4.895 19.105 4 18 4H6C4.895 4 4 4.895 4 6V18C4 19.105 4.895 20 6 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">{nodeLabel}</h3>
              <p className="text-gray-500 text-xs">Reference image</p>
            </div>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="text-[#666666] hover:text-white transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  transition={{ duration: 0.1 }}
                  className="absolute right-0 top-full mt-1 w-48 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 overflow-hidden"
                >
                  <button
                    onClick={handleDuplicate}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Duplicate Node
                  </button>

                  <button
                    onClick={handleReset}
                    disabled={!image}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Clear Image
                  </button>

                  <div className="border-t border-[#2a2a2a]" />

                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 hover:bg-[#2a2a2a] transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Node
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Image Preview or Upload Zone */}
      <div className="p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        {image ? (
          <div className="relative group flex-1 min-h-0 flex flex-col h-full overflow-hidden rounded-lg">
            {/* Loading skeleton */}
            {imageLoading && (
              <div className="absolute inset-0 bg-[#1a1a1a] rounded-lg animate-pulse flex items-center justify-center z-10">
                <div className="text-gray-600 text-xs">Loading...</div>
              </div>
            )}
            <img
              src={image}
              alt="Imported"
              className={`absolute inset-0 w-full h-full object-cover rounded-lg transition-opacity duration-300 ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
              loading="lazy"
              decoding="async"
              onLoad={() => setImageLoading(false)}
              onError={(e) => {
                setImageLoading(false);
                // Fallback if image fails to load
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  const fallback = document.createElement('div');
                  fallback.className = 'w-full h-full min-h-[160px] bg-[#1a1a1a] rounded-lg flex items-center justify-center flex-1';
                  fallback.innerHTML = '<span class="text-gray-500 text-xs">Failed to load image</span>';
                  parent.appendChild(fallback);
                }
              }}
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center z-20">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
                <div className="px-4 py-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-white text-xs font-medium hover:bg-white/20 transition-colors">
                  {uploading ? 'Uploading...' : 'Replace Image'}
                </div>
              </label>
            </div>
          </div>
        ) : (
          <label className="cursor-pointer flex-1 flex flex-col h-full">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
            <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg h-full flex-1 flex flex-col items-center justify-center hover:border-[#3a3a3a] hover:bg-[#1a1a1a] transition-all min-h-[160px]">
              <Upload className="w-8 h-8 text-gray-600 mb-2" />
              <span className="text-xs text-gray-600">{uploading ? 'Uploading...' : 'Click to upload'}</span>
            </div>
          </label>
        )}
      </div>

      {/* Output Handle */}
      <SmartHandle
        nodeId={id}
        handleId="image"
        handleType="image"
        type="source"
        position={Position.Right}
        style={{ top: '50%' }}
      />
    </motion.div>
  );
}
