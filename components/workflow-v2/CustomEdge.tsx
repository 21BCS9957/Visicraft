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

const WIRE_CORE = '#f4f0e8';
const WIRE_WARM = '#d8d2c6';
const WIRE_HIGHLIGHT = '#ffffff';

const HANDLE_RADIUS = 6;
const EDGE_STROKE_WIDTH = 2.85;
const SELECTED_EDGE_STROKE_WIDTH = 3.35;
const EDGE_OUTLINE_WIDTH = 6.9;
const SELECTED_EDGE_OUTLINE_WIDTH = 7.6;
const SOCKET_RING_WIDTH = 1.2;
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
  const handleClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
    toast.success('Connection removed');
  }, [id, setEdges]);

  return (
    <g className="react-flow__edge">
      <defs>
        <filter id={`wireGlow-${id}`} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="2.6" result="softGlow"/>
          <feMerge>
            <feMergeNode in="softGlow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <linearGradient id={`wireGradient-${id}`} gradientUnits="userSpaceOnUse" x1={sourcePoint.x} y1={sourcePoint.y} x2={targetPoint.x} y2={targetPoint.y}>
          <stop offset="0%" stopColor={WIRE_WARM} stopOpacity="0.76"/>
          <stop offset="16%" stopColor={WIRE_CORE} stopOpacity="0.98"/>
          <stop offset="52%" stopColor={WIRE_HIGHLIGHT} stopOpacity="1"/>
          <stop offset="84%" stopColor={WIRE_CORE} stopOpacity="0.98"/>
          <stop offset="100%" stopColor={WIRE_WARM} stopOpacity="0.78"/>
        </linearGradient>

        <filter id={`wireTexture-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="2" seed="7" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.22" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>

      <path
        d={edgePath}
        stroke="rgba(0, 0, 0, 0.82)"
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

      <path
        d={edgePath}
        stroke="rgba(255, 250, 239, 0.52)"
        strokeWidth={selected ? 5.8 : 5.15}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={selected ? 0.34 : 0.22}
        style={{
          pointerEvents: 'none',
          filter: `url(#wireGlow-${id})`,
          vectorEffect: 'non-scaling-stroke',
        }}
      />

      <path
        id={id}
        className="workflow-edge-cable"
        d={edgePath}
        stroke={`url(#wireGradient-${id})`}
        strokeWidth={selected ? SELECTED_EDGE_STROKE_WIDTH : EDGE_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        onClick={handleClick}
        style={{
          cursor: 'pointer',
          vectorEffect: 'non-scaling-stroke', // Maintain stroke width on zoom
          shapeRendering: 'geometricPrecision', // High quality rendering
          filter: `url(#wireTexture-${id})`,
        }}
      />

      <path
        d={edgePath}
        stroke="rgba(255, 255, 255, 0.68)"
        strokeWidth={0.82}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={selected ? 0.44 : 0.32}
        style={{
          pointerEvents: 'none',
          vectorEffect: 'non-scaling-stroke',
          mixBlendMode: 'screen',
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
        curvature: 0.42,
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
      <defs>
        <filter id="workflow-connection-preview-glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="2.6" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <linearGradient id="workflow-connection-preview-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={WIRE_WARM} stopOpacity="0.75"/>
          <stop offset="50%" stopColor={WIRE_HIGHLIGHT} stopOpacity="1"/>
          <stop offset="100%" stopColor={WIRE_CORE} stopOpacity="0.92"/>
        </linearGradient>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="rgba(0, 0, 0, 0.82)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={7}
        style={{ pointerEvents: 'none', vectorEffect: 'non-scaling-stroke' }}
      />
      <path
        d={path}
        fill="none"
        stroke="rgba(255, 250, 239, 0.46)"
        opacity={0.3}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={5}
        style={{
          pointerEvents: 'none',
          filter: 'url(#workflow-connection-preview-glow)',
          vectorEffect: 'non-scaling-stroke',
        }}
      />
      <path
        d={path}
        fill="none"
        stroke="url(#workflow-connection-preview-gradient)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.85}
        style={{ pointerEvents: 'none', vectorEffect: 'non-scaling-stroke' }}
      />
    </g>
  );
}
