'use client';

import { useState, useRef, useEffect } from 'react';
import { NodeProps, useReactFlow, NodeResizer } from 'reactflow';
import { MoreVertical, StickyNote, Copy, Trash2, RefreshCw, Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from '@/lib/toast';

const NOTE_COLORS = [
  { name: 'Yellow', bg: '#fef3c7', border: '#fbbf24', text: '#78350f' },
  { name: 'Pink', bg: '#fce7f3', border: '#ec4899', text: '#831843' },
  { name: 'Blue', bg: '#dbeafe', border: '#3b82f6', text: '#1e3a8a' },
  { name: 'Green', bg: '#d1fae5', border: '#10b981', text: '#064e3b' },
  { name: 'Purple', bg: '#e9d5ff', border: '#a855f7', text: '#581c87' },
  { name: 'Orange', bg: '#fed7aa', border: '#f97316', text: '#7c2d12' },
];

export function NoteNode({ data, selected, id }: NodeProps) {
  const { setNodes, getNodes, setEdges, getEdges } = useReactFlow();
  const [note, setNote] = useState(data.text || '');
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorIndex, setColorIndex] = useState(data.colorIndex || 0);
  const menuRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  const currentColor = NOTE_COLORS[colorIndex];

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
    };

    if (showMenu || showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu, showColorPicker]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNote(value);

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, text: value } };
        }
        return node;
      })
    );
  };

  const handleColorChange = (index: number) => {
    setColorIndex(index);
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, colorIndex: index } };
        }
        return node;
      })
    );
    setShowColorPicker(false);
    toast.success(`Note color changed to ${NOTE_COLORS[index].name}`);
  };

  const handleDuplicate = () => {
    const nodes = getNodes();
    const currentNode = nodes.find(n => n.id === id);

    if (!currentNode) return;

    const newNode = {
      ...currentNode,
      id: `note-${Date.now()}`,
      position: {
        x: currentNode.position.x + 50,
        y: currentNode.position.y + 50,
      },
      data: { ...currentNode.data },
    };

    setNodes((nds) => [...nds, newNode]);
    toast.success('Note duplicated!');
    setShowMenu(false);
  };

  const handleClear = () => {
    setNote('');
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, text: '' } }
          : node
      )
    );
    toast.success('Note cleared!');
    setShowMenu(false);
  };

  const handleDelete = () => {
    setNodes((nds) => nds.filter((node) => node.id !== id));
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id));
    toast.success('Note deleted!');
    setShowMenu(false);
  };

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`
        workflow-note-card
        group
        rounded-xl
        shadow-xl
        min-w-[280px]
        min-h-[200px]
        h-full
        flex flex-col
        transition-all
        ${selected ? 'ring-2 ring-offset-2 ring-offset-black' : ''}
      `}
      style={{
        cursor: 'default',
        backgroundColor: currentColor.bg,
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: currentColor.border,
      }}
    >
      {/* Node Resizer */}
      <NodeResizer
        color={currentColor.border}
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
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ borderColor: currentColor.border + '40' }}
      >
        <div className="flex items-center gap-2">
          <StickyNote
            className="w-4 h-4"
            style={{ color: currentColor.text }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: currentColor.text }}
          >
            Note
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Color Picker Button */}
          <div className="relative" ref={colorPickerRef}>
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="p-1.5 rounded hover:bg-black/10 transition-colors"
              style={{ color: currentColor.text }}
              title="Change color"
            >
              <Palette className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {showColorPicker && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: -6 }}
                  transition={{ type: 'spring', bounce: 0.35, duration: 0.3 }}
                  className="absolute right-0 top-full mt-2 z-50"
                  style={{
                    background: 'rgba(0,0,0,0.55)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '999px',
                    padding: '6px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  {NOTE_COLORS.map((color, index) => (
                    <motion.button
                      key={index}
                      initial={{ opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.4 }}
                      transition={{
                        type: 'spring',
                        bounce: 0.5,
                        duration: 0.35,
                        delay: index * 0.04,
                      }}
                      onClick={() => handleColorChange(index)}
                      title={color.name}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        backgroundColor: color.bg,
                        border: `2.5px solid ${color.border}`,
                        flexShrink: 0,
                        boxShadow: colorIndex === index
                          ? `0 0 0 2px white, 0 0 0 4px ${color.border}`
                          : '0 1px 4px rgba(0,0,0,0.3)',
                        transform: colorIndex === index ? 'scale(1.2)' : 'scale(1)',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Menu Button */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded hover:bg-black/10 transition-colors"
              style={{ color: currentColor.text }}
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
                    Duplicate Note
                  </button>

                  <button
                    onClick={handleClear}
                    disabled={!note}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-white hover:bg-[#2a2a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Clear Note
                  </button>

                  <div className="border-t border-[#2a2a2a]" />

                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 hover:bg-[#2a2a2a] transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Note
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Textarea */}
      <div className="p-4 flex-1 flex flex-col min-h-[150px]">
        <textarea
          value={note}
          onChange={handleChange}
          placeholder="Write your notes here...&#10;&#10;• Ideas&#10;• Reminders&#10;• Documentation"
          className="
            w-full flex-1
            bg-transparent
            border-none
            rounded-lg
            px-0 py-0
            text-sm
            placeholder:opacity-50
            focus:outline-none
            resize-none
            nodrag
          "
          style={{ color: currentColor.text }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <div
          className="text-right text-xs mt-2 opacity-60"
          style={{ color: currentColor.text }}
        >
          {note.length} characters
        </div>
      </div>
    </motion.div>
  );
}
