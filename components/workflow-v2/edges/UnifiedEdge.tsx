'use client';

import { EdgeProps, getBezierPath } from 'reactflow';

const EDGE_COLORS = {
  reference: { start: '#f97316', end: '#fb923c' },
  source: { start: '#3b82f6', end: '#60a5fa' },
  prompt: { start: '#8b5cf6', end: '#a78bfa' },
  output: { start: '#10b981', end: '#34d399' },
};

export default function UnifiedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25, // CONSISTENT curvature
  });

  // Determine color based on handle type
  const handleType = sourceHandleId?.includes('reference') ? 'reference'
    : sourceHandleId?.includes('source') ? 'source'
    : sourceHandleId?.includes('prompt') ? 'prompt'
    : 'output';

  const colors = EDGE_COLORS[handleType];

  return (
    <>
      <defs>
        <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colors.start} stopOpacity={0.8} />
          <stop offset="100%" stopColor={colors.end} stopOpacity={0.5} />
        </linearGradient>
        
        {/* Subtle glow */}
        <filter id={`glow-${id}`}>
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        stroke={`url(#gradient-${id})`}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        markerEnd={markerEnd}
        filter={`url(#glow-${id})`}
        style={style}
      />
    </>
  );
}
