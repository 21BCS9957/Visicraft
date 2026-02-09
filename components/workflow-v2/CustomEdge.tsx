'use client';

import React, { memo, useCallback } from 'react';
import { EdgeProps, getBezierPath, useReactFlow } from 'reactflow';
import toast from 'react-hot-toast';

// Extended EdgeProps to include handle properties
interface CustomEdgeProps extends EdgeProps {
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

// Memoize color calculation
const getEdgeColor = (sourceHandle?: string | null, targetHandle?: string | null): string => {
  if (targetHandle === 'referenceImage' || targetHandle === 'sourceImage') {
    return '#f97316'; // Orange for images
  } else if (targetHandle === 'prompt') {
    return '#06b6d4'; // Cyan for prompt
  } else if (sourceHandle === 'image') {
    return '#3b82f6'; // Blue for import images
  } else if (sourceHandle === 'prompt') {
    return '#8b5cf6'; // Purple for prompt text
  }
  return '#10b981'; // Green for generated output
};

function CustomEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandle,
  targetHandle,
  selected,
}: CustomEdgeProps) {
  const { setEdges } = useReactFlow();
  
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeColor = getEdgeColor(sourceHandle, targetHandle);

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
    toast.success('Connection removed');
  }, [id, setEdges]);

  return (
    <>
      {/* Main edge path - smooth bezier curve */}
      <path
        id={id}
        className="react-flow__edge-path cursor-pointer transition-all"
        d={edgePath}
        stroke={edgeColor}
        strokeWidth={selected ? 3 : 2}
        fill="none"
        onClick={handleClick}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          transition: 'stroke-width 0.15s ease, stroke 0.15s ease',
        }}
      />
      
      {/* Glow effect when selected */}
      {selected && (
        <path
          d={edgePath}
          stroke={edgeColor}
          strokeWidth={8}
          fill="none"
          opacity={0.2}
          strokeLinecap="round"
          style={{ pointerEvents: 'none' }}
        />
      )}
      
      {/* Invisible wider path for easier clicking */}
      <path
        d={edgePath}
        stroke="transparent"
        strokeWidth={20}
        fill="none"
        onClick={handleClick}
        className="cursor-pointer"
        strokeLinecap="round"
        style={{ pointerEvents: 'stroke' }}
      />
    </>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const CustomEdge = memo(CustomEdgeComponent);
