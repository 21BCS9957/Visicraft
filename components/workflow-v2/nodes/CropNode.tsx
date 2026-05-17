'use client';

import { useMemo, useState } from 'react';
import { Download, Crop, Check } from 'lucide-react';
import { NodeProps, NodeResizer, Position, useReactFlow } from 'reactflow';
import toast from '@/lib/toast';
import { SmartHandle } from '../SmartHandle';
import { useWorkflow } from '../WorkflowContext';

const RATIO_PRESETS = [
  { id: 'custom', label: 'Custom', width: 1, height: 1 },
  { id: '1:1', label: '1:1', width: 1, height: 1 },
  { id: '4:5', label: '4:5', width: 4, height: 5 },
  { id: '5:4', label: '5:4', width: 5, height: 4 },
  { id: '16:9', label: '16:9', width: 16, height: 9 },
  { id: '9:16', label: '9:16', width: 9, height: 16 },
];

type NodeData = Record<string, unknown>;

export function CropNode({ data, selected, id }: NodeProps) {
  const { getNodes, getEdges } = useReactFlow();
  const { updateNodeData } = useWorkflow();
  const [ratio, setRatio] = useState(String(data.cropRatio || '1:1'));
  const [width, setWidth] = useState(Number(data.cropWidth || 1080));
  const [height, setHeight] = useState(Number(data.cropHeight || 1080));

  const sourceUrl = useMemo(() => {
    const edge = getEdges().find((candidate) => candidate.target === id && candidate.targetHandle === 'image');
    const sourceNode = edge ? getNodes().find((node) => node.id === edge.source) : null;
    return getNodeImageUrl(sourceNode?.data as NodeData | undefined) || String(data.sourceImageUrl || '');
  }, [data.sourceImageUrl, getEdges, getNodes, id]);

  const selectedRatio = RATIO_PRESETS.find((preset) => preset.id === ratio) ?? RATIO_PRESETS[1];
  const aspectRatio = ratio === 'custom' ? `${width} / ${height}` : `${selectedRatio.width} / ${selectedRatio.height}`;

  const handleRatioChange = (nextRatio: string) => {
    setRatio(nextRatio);
    updateNodeData(id, { cropRatio: nextRatio });
    const preset = RATIO_PRESETS.find((item) => item.id === nextRatio);
    if (preset && nextRatio !== 'custom') {
      const base = 1080;
      const nextWidth = Math.round(base * preset.width / Math.max(preset.width, preset.height));
      const nextHeight = Math.round(base * preset.height / Math.max(preset.width, preset.height));
      setWidth(nextWidth);
      setHeight(nextHeight);
      updateNodeData(id, { cropWidth: nextWidth, cropHeight: nextHeight });
    }
  };

  const applyCrop = async () => {
    if (!sourceUrl) {
      toast.error('Connect an image before cropping');
      return;
    }

    try {
      const croppedUrl = await cropCenter(sourceUrl, width, height);
      updateNodeData(id, {
        croppedImage: croppedUrl,
        generatedImage: croppedUrl,
        images: [croppedUrl],
        status: 'complete',
      });
      toast.success('Crop applied');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Crop failed');
    }
  };

  const result = typeof data.croppedImage === 'string' ? data.croppedImage : null;

  return (
    <div
      className={`
        workflow-node-card workflow-node-crop
        group bg-[#1a1a1a] border-2 border-[#2a2a2a] rounded-2xl shadow-xl
        min-w-[320px] min-h-[360px] h-full flex flex-col transition-all
        ${selected ? 'ring-2 ring-amber-500/40 border-amber-500/30' : ''}
      `}
      style={{ cursor: 'default' }}
    >
      <NodeResizer color="#c89631" isVisible={false} minWidth={320} minHeight={360} />

      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg">
              <Crop className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">Crop Image</h3>
              <p className="text-gray-500 text-xs">Frame and export</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 flex-1 min-h-0 flex flex-col gap-3">
        <div className="workflow-crop-preview" style={{ aspectRatio }}>
          {sourceUrl ? (
            <img src={sourceUrl} alt="Crop source" />
          ) : (
            <span>Connect an image</span>
          )}
        </div>

        <div className="workflow-crop-presets nodrag nopan">
          {RATIO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleRatioChange(preset.id)}
              className={ratio === preset.id ? 'active' : ''}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="workflow-crop-dimensions nodrag nopan">
          <label>
            <span>W</span>
            <input
              value={width}
              type="number"
              min={64}
              onChange={(event) => {
                const next = Number(event.target.value);
                setWidth(next);
                setRatio('custom');
                updateNodeData(id, { cropWidth: next, cropRatio: 'custom' });
              }}
            />
          </label>
          <label>
            <span>H</span>
            <input
              value={height}
              type="number"
              min={64}
              onChange={(event) => {
                const next = Number(event.target.value);
                setHeight(next);
                setRatio('custom');
                updateNodeData(id, { cropHeight: next, cropRatio: 'custom' });
              }}
            />
          </label>
        </div>

        <button className="workflow-crop-apply nodrag nopan" type="button" onClick={applyCrop}>
          <Check className="w-4 h-4" />
          Apply Crop
        </button>

        {result && (
          <a className="workflow-crop-download nodrag nopan" href={result} download={`crop-${id}.png`}>
            <Download className="w-4 h-4" />
            Download
          </a>
        )}
      </div>

      <SmartHandle nodeId={id} handleId="image" handleType="image" type="target" position={Position.Left} style={{ top: '50%' }} />
      <SmartHandle nodeId={id} handleId="generatedImage" handleType="output" type="source" position={Position.Right} style={{ top: '50%' }} />
    </div>
  );
}

function getNodeImageUrl(data?: NodeData): string | null {
  if (!data) return null;
  const value = data.generatedImage || data.croppedImage || data.supabaseUrl || data.imageUrl;
  if (typeof value === 'string' && value.length > 0) return value;
  if (Array.isArray(data.images) && typeof data.images[0] === 'string') return data.images[0];
  return null;
}

async function cropCenter(sourceUrl: string, outputWidth: number, outputHeight: number): Promise<string> {
  const image = await loadImage(sourceUrl);
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = outputWidth / outputHeight;

  let sx = 0;
  let sy = 0;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = (image.naturalHeight - sh) / 2;
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Crop canvas could not be created');

  context.drawImage(image, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
  return canvas.toDataURL('image/png');
}

function loadImage(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load this image for cropping'));
    image.src = sourceUrl;
  });
}
