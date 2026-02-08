'use client';

import { Image, MessageSquare, Zap, MonitorPlay } from 'lucide-react';
import { motion } from 'framer-motion';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import { NodeType } from '@/types/workflow';

const nodeDefinitions = [
  {
    type: 'referenceImage' as NodeType,
    label: 'Reference Image',
    icon: Image,
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    description: 'Style reference',
  },
  {
    type: 'sourceImage' as NodeType,
    label: 'Source Image',
    icon: Image,
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    description: 'Content to transform',
  },
  {
    type: 'prompt' as NodeType,
    label: 'Prompt',
    icon: MessageSquare,
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    description: 'Text description',
  },
  {
    type: 'generate' as NodeType,
    label: 'Generate',
    icon: Zap,
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    description: 'AI generation',
  },
  {
    type: 'output' as NodeType,
    label: 'Output',
    icon: MonitorPlay,
    gradient: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
    description: 'Display results',
  },
];

export function NodePalette() {
  const addNode = useWorkflowStore((state) => state.addNode);

  const handleAddNode = (type: NodeType) => {
    // Add node at center of viewport
    const position = {
      x: Math.random() * 400 + 100,
      y: Math.random() * 400 + 100,
    };
    addNode(type, position);
  };

  return (
    <div className="w-64 h-full bg-[#1a1a1a] border-r border-gray-800 p-4 overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-1">Nodes</h2>
        <p className="text-xs text-gray-500">Click to add to canvas</p>
      </div>

      <div className="space-y-3">
        {nodeDefinitions.map((node, index) => (
          <motion.button
            key={node.type}
            onClick={() => handleAddNode(node.type)}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ scale: 1.02, x: 4 }}
            whileTap={{ scale: 0.98 }}
            className="w-full p-3 rounded-lg border border-gray-700 hover:border-gray-600 transition-all group cursor-pointer"
            style={{ background: 'rgba(26, 26, 26, 0.8)' }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: node.gradient }}
              >
                <node.icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-sm font-medium text-white group-hover:text-gray-100">
                  {node.label}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {node.description}
                </p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="mt-8 p-3 bg-[#0a0a0a] border border-gray-800 rounded-lg">
        <h3 className="text-xs font-medium text-gray-400 mb-2">Quick Tips</h3>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• Click nodes to add them</li>
          <li>• Drag to connect outputs to inputs</li>
          <li>• Delete key to remove selected</li>
          <li>• Scroll to zoom canvas</li>
        </ul>
      </div>
    </div>
  );
}
