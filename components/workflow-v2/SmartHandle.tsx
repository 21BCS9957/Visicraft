'use client';

import { useEffect, useState, CSSProperties } from 'react';
import { Handle, Position, useReactFlow, HandleProps } from 'reactflow';

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
  const { getEdges } = useReactFlow();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const edges = getEdges();
    const connected = edges.some((edge) => {
      if (type === 'source') {
        return edge.source === nodeId && edge.sourceHandle === handleId;
      } else {
        return edge.target === nodeId && edge.targetHandle === handleId;
      }
    });
    setIsConnected(connected);
  }, [getEdges, nodeId, handleId, type]);

  return (
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
        background: isConnected ? 'currentColor' : 'transparent',
        ...style,
      }}
    />
  );
}
