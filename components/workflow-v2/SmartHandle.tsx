'use client';

import { CSSProperties } from 'react';
import { Handle, Position, HandleProps, useStore } from 'reactflow';

interface SmartHandleProps extends Omit<HandleProps, 'type'> {
  nodeId: string;
  handleId: string;
  handleType: 'reference' | 'prompt' | 'output' | 'image';
  position: Position;
  type: 'source' | 'target';
  style?: CSSProperties;
}

export function SmartHandle({
  nodeId,
  handleId,
  handleType,
  position,
  type,
  style,
  ...props
}: SmartHandleProps) {
  const isConnected = useStore((store) =>
    store.edges.some((edge) => {
      if (type === 'source') {
        return edge.source === nodeId && edge.sourceHandle === handleId;
      }
      return edge.target === nodeId && edge.targetHandle === handleId;
    })
  );
  const label = getHandleLabel(handleId, type);
  const labelClassName = [
    'workflow-handle-label',
    `workflow-handle-label-${String(position).toLowerCase()}`,
    `workflow-handle-label-${handleType}`,
    isConnected ? 'connected' : '',
  ].join(' ');

  return (
    <>
      {label && <div className={labelClassName} style={style}>{label}</div>}
      <Handle
        {...props}
        type={type}
        position={position}
        id={handleId}
        className={`
          handle-${handleType}
          ${isConnected ? 'connected' : ''}
          transition-all duration-200
        `}
        style={{
          width: '12px',
          height: '12px',
          border: '2px solid',
          background: isConnected ? 'currentColor' : '#1a1a1a',
          ...style,
        }}
      />
    </>
  );
}

function getHandleLabel(handleId: string, type: 'source' | 'target') {
  if (type === 'source') {
    if (handleId === 'generatedImage' || handleId === 'generatedVideo') return 'Image';
    return null;
  }

  switch (handleId) {
    case 'prompt':
      return 'Prompt *';
    case 'referenceImage':
      return 'Reference Image';
    case 'image':
      return 'Image';
    default:
      return null;
  }
}
