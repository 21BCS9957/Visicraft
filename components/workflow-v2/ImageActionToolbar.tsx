'use client';

import { useCallback } from 'react';
import { Edge, Node, useReactFlow } from 'reactflow';
import {
  Clapperboard,
  Crop,
  Download,
  Edit3,
  Expand,
  Maximize2,
  MoreHorizontal,
  Sparkles,
} from 'lucide-react';
import toast from '@/lib/toast';
import { useWorkflow } from './WorkflowContext';

type ImageActionToolbarProps = {
  nodeId: string;
  sourceHandle: string;
  imageUrl?: string | null;
  onDownload?: () => void;
  onFullscreen?: () => void;
};

export function ImageActionToolbar({
  nodeId,
  sourceHandle,
  imageUrl,
  onDownload,
  onFullscreen,
}: ImageActionToolbarProps) {
  const { getNode } = useReactFlow();
  const { setNodes, setEdges } = useWorkflow();

  const createConnectedNode = useCallback((action: 'upscale' | 'edit' | 'animate' | 'crop') => {
    const sourceNode = getNode(nodeId);
    if (!sourceNode) return;

    const now = Date.now();
    const position = {
      x: sourceNode.position.x + (sourceNode.width ?? 340) + 160,
      y: sourceNode.position.y + (action === 'crop' ? 24 : action === 'animate' ? 180 : 0),
    };

    let targetNode: Node;
    let targetHandle = 'referenceImage';

    if (action === 'crop') {
      targetHandle = 'image';
      targetNode = {
        id: `crop-${now}`,
        type: 'crop',
        position,
        data: {
          label: 'Crop Image',
          cropRatio: '1:1',
          cropWidth: 1080,
          cropHeight: 1080,
          sourceImageUrl: imageUrl ?? null,
          status: 'idle',
        },
      };
    } else if (action === 'animate') {
      targetNode = {
        id: `videoGenerate-${now}`,
        type: 'videoGenerate',
        position,
        data: {
          label: 'Animate Image',
          model: 'seedance-2',
          mode: 'omni_reference',
          aspectRatio: '16:9',
          duration: '5s',
          resolution: '720p',
          promptText: 'Create a smooth premium motion video from this image. Keep the subject, composition, and visual style consistent.',
          status: 'idle',
        },
      };
    } else {
      targetNode = {
        id: `generate-${now}`,
        type: 'generate',
        position,
        data: {
          label: action === 'upscale' ? 'Upscale Image' : 'Edit Image',
          model: 'nano-banana-pro',
          aspectRatio: '16:9',
          resolution: action === 'upscale' ? '4K' : '2K',
          promptText: action === 'upscale'
            ? 'Upscale this image with cleaner detail, sharper edges, and premium high-resolution quality. Preserve the original composition exactly.'
            : 'Edit this image while preserving the main subject, composition, and style.',
          status: 'idle',
        },
      };
    }

    const edge: Edge = {
      id: `edge-${now}-${action}`,
      source: nodeId,
      sourceHandle,
      target: targetNode.id,
      targetHandle,
      type: 'custom',
      animated: false,
      style: { strokeWidth: 3.25 },
    };

    setNodes((nodes) => [...nodes, targetNode]);
    setEdges((edges) => [...edges, edge]);
    toast.success(`${getActionName(action)} node added`);
  }, [getNode, imageUrl, nodeId, setEdges, setNodes, sourceHandle]);

  return (
    <div
      className="workflow-image-toolbar nodrag nopan"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button title="Upscale image" onClick={() => createConnectedNode('upscale')}>
        <Sparkles />
      </button>
      <button title="Edit image" onClick={() => createConnectedNode('edit')}>
        <Edit3 />
      </button>
      <button title="Animate image" onClick={() => createConnectedNode('animate')}>
        <Clapperboard />
      </button>
      <button title="Crop image" onClick={() => createConnectedNode('crop')}>
        <Crop />
      </button>
      <span className="workflow-image-toolbar-separator" />
      {onDownload && (
        <button title="Download image" onClick={onDownload}>
          <Download />
        </button>
      )}
      {onFullscreen && (
        <button title="Open full screen" onClick={onFullscreen}>
          <Maximize2 />
        </button>
      )}
      <button title="Fit image">
        <Expand />
      </button>
      <button title="More actions">
        <MoreHorizontal />
      </button>
    </div>
  );
}

function getActionName(action: 'upscale' | 'edit' | 'animate' | 'crop') {
  switch (action) {
    case 'upscale':
      return 'Upscale';
    case 'edit':
      return 'Edit';
    case 'animate':
      return 'Animate';
    case 'crop':
      return 'Crop';
  }
}
