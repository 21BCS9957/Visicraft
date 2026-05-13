'use client';

import React, { memo, useCallback } from 'react';
import {
  ConnectionLineComponentProps,
  EdgeProps,
  getSmoothStepPath,
  getBezierPath,
  getStraightPath,
  Position,
  useReactFlow,
} from 'reactflow';
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
  if (targetHandle === 'referenceImage') {
    return colorMap.reference;
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

const HANDLE_RADIUS = 6;
const EDGE_STROKE_WIDTH = 2.75;
const SELECTED_EDGE_STROKE_WIDTH = 3.25;
const EDGE_OUTLINE_WIDTH = 5;
const SELECTED_EDGE_OUTLINE_WIDTH = 6;
const SOCKET_RING_WIDTH = 4.5;
const DOCK_OFFSET = HANDLE_RADIUS + SOCKET_RING_WIDTH + EDGE_STROKE_WIDTH / 2;

const getDockedPoint = (x: number, y: number, position: Position, outward = true) => {
  const direction = outward ? 1 : -1;

  switch (position) {
    case Position.Left:
      return { x: x - DOCK_OFFSET * direction, y };
    case Position.Right:
      return { x: x + DOCK_OFFSET * direction, y };
    case Position.Top:
      return { x, y: y - DOCK_OFFSET * direction };
    case Position.Bottom:
      return { x, y: y + DOCK_OFFSET * direction };
    default:
      return { x, y };
  }
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
  const sourcePoint = getDockedPoint(sourceX, sourceY, sourcePosition);
  const targetPoint = getDockedPoint(targetX, targetY, targetPosition);
  
  // Get edge style from data or default to bezier for smooth curves
  const edgeStyle = data?.edgeStyle || 'bezier';
  const edgePath = getDockedEdgePath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    sourcePosition,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    targetPosition,
    edgeStyle,
  });

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

      {/* Dark outline keeps the connection readable without bleeding through handles. */}
      <path
        d={edgePath}
        stroke="rgba(0, 0, 0, 0.75)"
        strokeWidth={selected ? SELECTED_EDGE_OUTLINE_WIDTH : EDGE_OUTLINE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{
          pointerEvents: 'none',
          vectorEffect: 'non-scaling-stroke',
          shapeRendering: 'geometricPrecision',
        }}
      />

      {/* Main edge path with high quality rendering */}
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        stroke={selected ? `url(#gradient-${id})` : color}
        strokeWidth={selected ? SELECTED_EDGE_STROKE_WIDTH : EDGE_STROKE_WIDTH}
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

type DockedPathOptions = {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
  edgeStyle?: 'smooth' | 'bezier' | 'straight' | 'step';
};

function getDockedEdgePath({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  edgeStyle = 'bezier',
}: DockedPathOptions) {
  switch (edgeStyle) {
    case 'straight':
      return getStraightPath({ sourceX, sourceY, targetX, targetY })[0];
    case 'step':
      return getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 10,
      })[0];
    case 'smooth':
      return getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 28,
      })[0];
    case 'bezier':
    default:
      return getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        curvature: 0.34,
      })[0];
  }
}

export function PremiumConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: ConnectionLineComponentProps) {
  const sourcePoint = getDockedPoint(fromX, fromY, fromPosition);
  const targetPoint = getDockedPoint(toX, toY, toPosition);
  const path = getDockedEdgePath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    sourcePosition: fromPosition,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    targetPosition: toPosition,
    edgeStyle: 'bezier',
  });

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="rgba(0, 0, 0, 0.76)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={5.5}
        style={{ pointerEvents: 'none', vectorEffect: 'non-scaling-stroke' }}
      />
      <path
        d={path}
        fill="none"
        stroke="#f5f5f2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        style={{ pointerEvents: 'none', vectorEffect: 'non-scaling-stroke' }}
      />
    </g>
  );
}
