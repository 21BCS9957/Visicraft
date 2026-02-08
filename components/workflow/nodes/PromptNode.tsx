'use client';

import { Handle, Position } from 'reactflow';
import { MessageSquare } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import { PromptNodeData } from '@/types/workflow';

interface PromptNodeProps {
  id: string;
  data: PromptNodeData;
  selected?: boolean;
}

export function PromptNode({ id, data, selected }: PromptNodeProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  return (
    <>
      <BaseNode
        icon={MessageSquare}
        title="Prompt"
        gradient="linear-gradient(135deg, #10b981 0%, #059669 100%)"
        status={data.status}
        selected={selected}
      >
        <div className="space-y-2">
          <textarea
            value={data.text}
            onChange={(e) => updateNodeData(id, { text: e.target.value })}
            placeholder="Describe the style or modifications..."
            className="w-full h-24 px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-green-500 resize-none"
            maxLength={data.maxLength}
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Optional enhancement</span>
            <span>{data.text.length}/{data.maxLength}</span>
          </div>
        </div>
      </BaseNode>

      <Handle
        type="source"
        position={Position.Right}
        id="prompt"
        className="w-3 h-3 bg-green-500 border-2 border-white"
      />
    </>
  );
}
