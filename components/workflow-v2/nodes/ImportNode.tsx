'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Position, NodeProps, useReactFlow } from 'reactflow';
import { MoreVertical, Upload, Image as ImageIcon, Copy, Trash2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadImage } from '@/lib/supabase/storage';
import toast from 'react-hot-toast';
import { SmartHandle } from '../SmartHandle';

export function ImportNode({ data, selected, id }: NodeProps) {
  const { setNodes, getEdges, getNodes, setEdges } = useReactFlow();
  const [image, setImage] = useState<string | null>(data.imageUrl || null);
  const [uploading, setUploading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Determine node label based on data.nodeType or default to "Import"
  const nodeLabel = data.nodeType === 'reference' ? 'Reference' : data.nodeType === 'source' ? 'Source' : 'Import';

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
      
      console.log('✅ Image uploaded:', url);
      
      // Update this node's data
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                imageUrl: url,
                uploaded: true,
                supabaseUrl: url,
              },
            };
          }
          return node;
        })
      );

      // Update connected nodes
      const edges = getEdges();
      const connectedEdges = edges.filter(edge => edge.source === id);
      
      if (connectedEdges.length > 0) {
        setNodes((nds) =>
          nds.map((node) => {
            const isConnected = connectedEdges.some(edge => edge.target === node.id);
            if (isConnected && node.type === 'generate') {
              const edge = connectedEdges.find(e => e.target === node.id);
              const handleId = edge?.targetHandle;
              
              console.log('🔗 Updating connected Generate node:', {
                targetNode: node.id,
                handle: handleId,
                url
              });
              
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
      toast.error('Upload failed');
      console.error(error);
    } finally {
      setUploading(false);
    }
  }, [id, setNodes, getEdges]);

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
      whileHover={{ scale: 1.01 }}
      className={`
        group
        bg-[#1a1a1a]
        border border-[#2a2a2a]
        rounded-2xl
        shadow-xl
        min-w-[280px]
        transition-all
        ${selected ? 'ring-2 ring-blue-500/50' : ''}
      `}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 16L8.586 11.414C9.367 10.633 10.633 10.633 11.414 11.414L16 16M14 14L15.586 12.414C16.367 11.633 17.633 11.633 18.414 12.414L20 14M14 8H14.01M6 20H18C19.105 20 20 19.105 20 18V6C20 4.895 19.105 4 18 4H6C4.895 4 4 4.895 4 6V18C4 19.105 4.895 20 6 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">{nodeLabel}</h3>
              <p className="text-gray-500 text-xs">Source Image</p>
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
      <div className="p-4">
        {image ? (
          <div className="relative group">
            <img
              src={image}
              alt="Imported"
              className="w-full h-40 object-cover rounded-lg"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
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
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
            <div className="border-2 border-dashed border-[#2a2a2a] rounded-lg h-40 flex flex-col items-center justify-center hover:border-[#3a3a3a] hover:bg-[#1a1a1a] transition-all">
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
