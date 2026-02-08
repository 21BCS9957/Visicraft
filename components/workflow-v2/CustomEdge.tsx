'use client';

import React from 'react';
import { EdgeProps, getBezierPath } from 'reactflow';

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const gradient = data?.gradient || '#3b82f6';

  return (
    <>
      <defs>
        <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={gradient} stopOpacity={0.8} />
          <stop offset="100%" stopColor={gradient} stopOpacity={0.3} />
        </linearGradient>
      </defs>
      
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        stroke={`url(#gradient-${id})`}
        strokeWidth={2}
        fill="none"
      />
    </>
  );
}
