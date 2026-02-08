'use client';

import { Handle, Position } from 'reactflow';
import { MonitorPlay, Download, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { BaseNode } from './BaseNode';
import { useWorkflowStore } from '@/lib/stores/workflowStore';
import { OutputNodeData } from '@/types/workflow';

interface OutputNodeProps {
  id: string;
  data: OutputNodeData;
  selected?: boolean;
}

export function OutputNode({ id, data, selected }: OutputNodeProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  // Debug logging
  console.log('🎨 OutputNode render:', { 
    id, 
    images: data.images, 
    imagesLength: data.images?.length,
    status: data.status,
    fullData: data 
  });

  const handleDownload = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `thumbnail-${index + 1}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        className="w-3 h-3 bg-pink-500 border-2 border-white"
      />

      <BaseNode
        icon={MonitorPlay}
        title="Output Display"
        gradient="linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)"
        status={data.status}
        selected={selected}
      >
        <div className="space-y-3">
          {/* Debug: Show raw data */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-gray-600 p-2 bg-gray-900 rounded mb-2">
              <div>Images: {JSON.stringify(data.images)}</div>
              <div>Status: {data.status}</div>
              {/* Manual test input */}
              <input
                type="text"
                placeholder="Paste image URL to test..."
                className="w-full mt-2 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const url = (e.target as HTMLInputElement).value;
                    if (url) {
                      updateNodeData(id, { images: [url], status: 'complete' });
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }}
              />
              <div className="text-gray-500 mt-1">Press Enter to test with URL</div>
            </div>
          )}
          
          {(!data.images || data.images.length === 0) ? (
            <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-600 rounded-lg">
              <MonitorPlay className="w-8 h-8 text-gray-500 mb-2" />
              <p className="text-sm text-gray-500">Waiting for results...</p>
              <p className="text-xs text-gray-600 mt-1">
                {data.status === 'processing' ? 'Processing...' : 'Connect Generate node'}
              </p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-3"
            >
              {data.images.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Generated ${index + 1}`}
                    className="w-full rounded-lg"
                  />
                  {data.downloadable && (
                    <button
                      onClick={() => handleDownload(url, index)}
                      className="absolute top-2 right-2 bg-black/70 hover:bg-black text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              {data.downloadable && data.images.length > 1 && (
                <button
                  onClick={() => data.images.forEach((url, i) => handleDownload(url, i))}
                  className="w-full py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Download All ({data.images.length})
                </button>
              )}
            </motion.div>
          )}

          {data.showMetadata && data.metadata && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-2 bg-[#0a0a0a] border border-gray-700 rounded-lg"
            >
              <div className="flex items-center gap-2 mb-2">
                <Info className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-400">Metadata</span>
              </div>
              <pre className="text-xs text-gray-500 overflow-auto max-h-32">
                {JSON.stringify(data.metadata, null, 2)}
              </pre>
            </motion.div>
          )}

          <button
            onClick={() => updateNodeData(id, { showMetadata: !data.showMetadata })}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {data.showMetadata ? 'Hide' : 'Show'} Metadata
          </button>
        </div>
      </BaseNode>
    </>
  );
}
