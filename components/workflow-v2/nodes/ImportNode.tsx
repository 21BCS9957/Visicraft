'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Position, NodeProps, useReactFlow, NodeResizer } from 'reactflow';
import { MoreVertical, Upload, Copy, Trash2, RefreshCw } from 'lucide-react';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadImage } from '@/lib/supabase/storage';
import toast from 'react-hot-toast';

export function ImportNode({ data, selected, id }: NodeProps) {
  const { setNodes, getEdges, getNodes, setEdges } = useReactFlow();
  const [image, setImage] = useState<string | null>(data.imageUrl || null);
  const [uploading, setUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Determine node label and color based on data.nodeType
  const nodeType = data.nodeType || 'import';
  const isReference = nodeType === 'reference';
  const isSource = nodeType === 'source';
  
  const nodeLabel = isReference ? 'Reference' : isSource ? 'Source' : 'Import';
  const iconColor = isReference ? 'text-orange-400' : 'text-blue-400';
  const iconBg = isReference ? 'bg-orange-500/20' : 'bg-blue-500/20';
  const handleClass = isReference ? 'handle-reference' : 'handle-source';

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
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    
    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Supabase
      const url = await uploadImage(file, 'source-images');

      // Update node data
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: { ...node.data, imageUrl: url, supabaseUrl: url },
            };
          }
          return node;
        })
      );

      // Update connected Generate nodes
      const edges = getEdges();
      const connectedEdges = edges.filter(edge => edge.source === id);
      
      if (connectedEdges.length > 0) {
        setNodes((nds) =>
          nds.map((node) => {
            const isConnected = connectedEdges.some(edge => edge.target === node.id);
            if (isConnected && node.type === 'generate') {
              const handleId = connectedEdges.find(e => e.target === node.id)?.targetHandle;
              
              if (handleId === 'referenceImage') {
                return {
                  ...node,
                  data: { ...node.data, referenceImageUrl: url },
                };
              } else if (handleId === 'sourceImage') {
                return {
                  ...node,
                  data: { ...node.data, sourceImageUrl: url },
                };
              }
            }
            return node;
          })
        );
      }

      toast.success('Image uploaded!');
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  }, [id, setNodes, getEdges]);

  const handleDuplicate = () => {
    const nodes = getNodes();
    const edges = getEdges();
    const currentNode = nodes.find(n => n.id === id);
    
    if (!currentNode) return;

    const newNode = {
      ...currentNode,
      id: `${nodeType}-${Date.now()}`,
      position: {
        x: currentNode.position.x + 50,
        y: currentNode.position.y + 50,
      },
      data: { ...currentNode.data },
    };

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
          ? { ...node, data: { ...node.data, imageUrl: null, supabaseUrl: null } }
          : node
      )
    );
    toast.success('Image cleared!');
    setShowMenu(false);
  };

  const handleDelete = () => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    toast.success('Node deleted!');
    setShowMenu(false);
  };

  // Check if handle is connected
  const edges = getEdges();
  const isConnected = edges.some(edge => edge.source === id);

  return (
    <div className={`min-w-[280px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl transition-all ${selected ? 'ring-2 ring-[#8b7355]' : ''}`}>
      {/* Node Resizer */}
      <NodeResizer
        color={isReference ? '#f97316' : '#3b82f6'}
        isVisible={selected}
        minWidth={280}
        minHeight={200}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 4,
        }}
      />

      {/* Header */}
      <div className="node-header">
        <div className={`node-header-icon ${iconBg}`}>
          <Icon icon="ph:image-fill" className={`w-4 h-4 ${iconColor}`} />
        </div>
        <span className="node-header-title">{nodeLabel} Image</span>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="node-header-menu"
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

      {/* Content */}
      <div className="node-content">
        {image ? (
          <div className="relative group">
            <img
              src={image}
              alt="Uploaded"
              className="w-full h-40 object-cover rounded-lg"
            />
            <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer rounded-lg">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
              <Upload className="w-6 h-6 text-white" />
            </label>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-[#2a2a2a] rounded-lg cursor-pointer hover:border-[#3a3a3a] transition-colors">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
            <Upload className={`w-8 h-8 mb-2 ${iconColor}`} />
            <span className="text-sm text-gray-400">
              {uploading ? 'Uploading...' : 'Click to upload'}
            </span>
          </label>
        )}
      </div>

      {/* Output Handle - RIGHT ONLY */}
      <div
        className={`react-flow__handle react-flow__handle-right ${handleClass} ${isConnected ? 'connected' : ''}`}
        style={{ 
          position: 'absolute',
          right: '-6px',
          top: '50%',
          transform: 'translateY(-50%)'
        }}
        data-handleid={nodeType}
        data-nodeid={id}
        data-handlepos="right"
      />
    </div>
  );
}
