'use client';

import React, { memo, useCallback } from 'react';
import { EdgeProps, getSmoothStepPath, getBezierPath, getStraightPath, useReactFlow } from 'reactflow';
import toast from '@/lib/toast';

// Extended EdgeProps to include handle properties
interface CustomEdgeProps extends EdgeProps {
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: {
    edgeStyle?: 'smooth' | 'bezier' | 'straight' | 'step';
  };
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
  data,
}: CustomEdgeProps) {
  const { setEdges } = useReactFlow();
  
  // Get edge style from data or default to bezier for smooth curves
  const edgeStyle = data?.edgeStyle || 'bezier';
  
  // Generate path based on edge style
  let edgePath: string;
  
  switch (edgeStyle) {
    case 'bezier':
      // Bezier curve - very curvy, organic feel (DEFAULT)
      [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        curvature: 0.25, // Natural curvature for smooth, flowing lines
      });
      break;
      
    case 'straight':
      // Straight line - minimal curviness
      [edgePath] = getStraightPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
      });
      break;
      
    case 'step':
      // Step path - angular, right angles
      [edgePath] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 8, // Small radius for sharper corners
      });
      break;
      
    case 'smooth':
    default:
      // Smooth step - balanced curviness (default)
      [edgePath] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 30, // Large radius for smooth curves
      });
      break;
  }

  const color = getEdgeColor(sourceHandle, targetHandle);

  const handleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
    toast.success('Connection removed');
  }, [id, setEdges]);

  return (
    <g className="react-flow__edge">
      <defs>
        {/* Enhanced glow filter for better visual quality */}
        <filter id={`glow-${id}`} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        {/* Gradient for selected state */}
        <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.8"/>
          <stop offset="50%" stopColor={color} stopOpacity="1"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.8"/>
        </linearGradient>
      </defs>

      {/* Outer glow when selected */}
      {selected && (
        <path
          d={edgePath}
          stroke={color}
          strokeWidth={8}
          fill="none"
          opacity={0.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ 
            pointerEvents: 'none',
            filter: `url(#glow-${id})`,
          }}
        />
      )}

      {/* Main edge path with high quality rendering */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        stroke={selected ? `url(#gradient-${id})` : color}
        strokeWidth={selected ? 3 : 2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        onClick={handleClick}
        style={{
          cursor: 'pointer',
          vectorEffect: 'non-scaling-stroke', // Maintain stroke width on zoom
          shapeRendering: 'geometricPrecision', // High quality rendering
        }}
      />
      
      {/* Invisible wider path for easier clicking */}
      <path
        d={edgePath}
        stroke="transparent"
        strokeWidth={24}
        fill="none"
        onClick={handleClick}
        strokeLinecap="round"
        strokeLinejoin="round"
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
