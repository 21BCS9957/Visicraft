'use client';

import { useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import { Image as ImageIcon, Upload, CheckCircle } from 'lucide-react';
import { BaseNode } from './BaseNode';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import { ReferenceImageNodeData } from '@/types/workflow';

interface ReferenceImageNodeProps {
  id: string;
  data: ReferenceImageNodeData;
  selected?: boolean;
}

export function ReferenceImageNode({ id, data, selected }: ReferenceImageNodeProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create preview
    const preview = URL.createObjectURL(file);
    
    updateNodeData(id, {
      image: file,
      preview,
      uploaded: false,
    });

    // Upload to Supabase
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'source-images');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.url) {
        updateNodeData(id, {
          supabaseUrl: result.url,
          uploaded: true,
        });
      }
    } catch (error) {
      console.error('Upload failed:', error);
      updateNodeData(id, { status: 'error' });
    }
  }, [id, updateNodeData]);

  return (
    <>
      <BaseNode
        icon={ImageIcon}
        title="Reference Image"
        gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
        status={data.status}
        selected={selected}
      >
        <div className="space-y-3">
          {!data.preview ? (
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-violet-500 transition-colors">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-sm text-gray-400">Upload reference</span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
            </label>
          ) : (
            <div className="relative">
              <img
                src={data.preview}
                alt="Reference"
                className="w-full h-32 object-cover rounded-lg"
              />
              {data.uploaded && (
                <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
              )}
              <button
                onClick={() => updateNodeData(id, { image: null, preview: null, uploaded: false, supabaseUrl: undefined })}
                className="absolute bottom-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600"
              >
                Remove
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Defines the style for generation
          </p>
        </div>
      </BaseNode>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        className="w-3 h-3 bg-blue-500 border-2 border-white"
      />
    </>
  );
}
