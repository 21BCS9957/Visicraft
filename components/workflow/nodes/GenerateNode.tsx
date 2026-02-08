'use client';

import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { Zap, Settings, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { BaseNode } from './BaseNode';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import { GenerateNodeData } from '@/types/workflow';

interface GenerateNodeProps {
  id: string;
  data: GenerateNodeData;
  selected?: boolean;
}

export function GenerateNode({ id, data, selected }: GenerateNodeProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      {/* Input handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="referenceImage"
        style={{ top: '30%' }}
        className="w-3 h-3 bg-blue-500 border-2 border-white"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="sourceImage"
        style={{ top: '50%' }}
        className="w-3 h-3 bg-blue-500 border-2 border-white"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="prompt"
        style={{ top: '70%' }}
        className="w-3 h-3 bg-green-500 border-2 border-white"
      />

      <BaseNode
        icon={Zap}
        title="Generate Thumbnail"
        gradient="linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)"
        status={data.status}
        selected={selected}
      >
        <div className="space-y-3">
          {/* Status display */}
          {data.status === 'processing' && (
            <motion.div
              className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
              <div className="flex-1">
                <p className="text-sm text-amber-500 font-medium">Generating...</p>
                <div className="mt-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-amber-500"
                    initial={{ width: '0%' }}
                    animate={{ width: `${data.progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>{showSettings ? 'Hide' : 'Show'} Settings</span>
          </button>

          {/* Settings panel */}
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3 pt-2 border-t border-gray-700"
            >
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Resolution</label>
                <select
                  value={data.settings.resolution}
                  onChange={(e) => updateNodeData(id, {
                    settings: { ...data.settings, resolution: e.target.value as any }
                  })}
                  className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="1K">1K</option>
                  <option value="2K">2K</option>
                  <option value="4K">4K</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Aspect Ratio</label>
                <select
                  value={data.settings.aspectRatio}
                  onChange={(e) => updateNodeData(id, {
                    settings: { ...data.settings, aspectRatio: e.target.value as any }
                  })}
                  className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="16:9">16:9 (YouTube)</option>
                  <option value="9:16">9:16 (Stories)</option>
                  <option value="1:1">1:1 (Square)</option>
                  <option value="4:3">4:3</option>
                  <option value="3:2">3:2</option>
                </select>
              </div>
            </motion.div>
          )}

          <p className="text-xs text-gray-500">
            Connects reference + source to generate
          </p>
        </div>
      </BaseNode>

      {/* Output handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="generatedImage"
        style={{ top: '40%' }}
        className="w-3 h-3 bg-pink-500 border-2 border-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="metadata"
        style={{ top: '60%' }}
        className="w-3 h-3 bg-purple-500 border-2 border-white"
      />
    </>
  );
}
