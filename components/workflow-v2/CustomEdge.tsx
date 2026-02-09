'use client';

import React, { memo, useCallback } from 'react';
import { EdgeProps, getSmoothStepPath, useReactFlow } from 'reactflow';
import toast from 'react-hot-toast';

// Extended EdgeProps to include handle properties
interface CustomEdgeProps extends EdgeProps {
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

// Color map for different handle types - matching SmartHandle colors
const colorMap = {
  reference: '#f97316', // Orange
  source: '#eab308',    // Yellow
  prompt: '#06b6d4',    // Cyan
  output: '#10b981',    // Green
  image: '#3b82f6',     // Blue
};

// Get edge color based on handle IDs
const getEdgeColor = (sourceHandle?: string | null, targetHandle?: string | null): string => {
  // Check target handle first (more specific)
  if (targetHandle === 'referenceImage' || targetHandle === 'sourceImage') {
    return colorMap.reference; // Orange for image inputs
  } else if (targetHandle === 'prompt') {
    return colorMap.prompt; // Cyan for prompt
  } else if (targetHandle === 'image') {
    return colorMap.output; // Green for output
  }
  
  // Check source handle
  if (sourceHandle === 'image') {
    return colorMap.image; // Blue for import node output
  } else if (sourceHandle === 'prompt') {
    return colorMap.prompt; // Cyan for prompt output
  } else if (sourceHandle === 'generatedImage') {
    return colorMap.output; // Green for generated output
  }
  
  return colorMap.output; // Default green
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
  
  // Use smooth step path for ultra-smooth curves
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 20, // Smooth rounded corners
  });

  const color = getEdgeColor(sourceHandle, targetHandle);

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
    toast.success('Connection removed');
  }, [id, setEdges]);

  return (
    <g>
      <defs>
        {/* Solid color for edge - no gradient for better performance */}
        <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Glow effect when selected - render behind */}
      {selected && (
        <path
          d={edgePath}
          stroke={color}
          strokeWidth={6}
          fill="none"
          opacity={0.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Main edge path - solid color matching handle */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        stroke={color}
        strokeWidth={selected ? 2.5 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        onClick={handleClick}
        style={{
          transition: 'none', // Remove transition for instant updates
          cursor: 'pointer',
        }}
      />
      
      {/* Invisible wider path for easier clicking */}
      <path
        d={edgePath}
        stroke="transparent"
        strokeWidth={20}
        fill="none"
        onClick={handleClick}
        strokeLinecap="round"
        style={{ 
          pointerEvents: 'stroke',
          cursor: 'pointer',
        }}
      />
    </g>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const CustomEdge = memo(CustomEdgeComponent);
