import React, { memo, useMemo, useEffect, useRef } from 'react';
import { MiniMap, useStore, getBezierPath, Position } from 'reactflow';

// Color map matching CustomEdge colors
const colorMap: Record<string, string> = {
    reference: '#f97316',
    source: '#eab308',
    prompt: '#06b6d4',
    output: '#10b981',
    image: '#3b82f6',
};

const WIRE_CORE = '#f4f0e8';
const WIRE_WARM = '#d8d2c6';
const WIRE_HIGHLIGHT = '#ffffff';

const getEdgeColor = (sourceHandle?: string | null, targetHandle?: string | null): string => {
    if (targetHandle === 'referenceImage') return colorMap.reference;
    if (targetHandle === 'prompt') return colorMap.prompt;
    if (targetHandle === 'image') return colorMap.output;
    if (sourceHandle === 'image') return colorMap.image;
    if (sourceHandle === 'prompt') return colorMap.prompt;
    if (sourceHandle === 'generatedImage') return colorMap.output;
    if (sourceHandle === 'generatedVideo') return '#a855f7';
    return colorMap.output;
};

interface MiniMapWithEdgesProps {
    nodeColor: (node: any) => string;
    nodeComponent: any;
    maskColor: string;
    className: string;
    style: React.CSSProperties;
    zoomable: boolean;
    pannable: boolean;
}

export const MiniMapWithEdges = memo(({
    nodeColor,
    nodeComponent,
    maskColor,
    className,
    style,
    zoomable,
    pannable,
}: MiniMapWithEdgesProps) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const edges = useStore((s) => s.edges);
    const nodeInternals = useStore((s) => s.nodeInternals);

    const edgeData = useMemo(() => {
        return edges.map((edge) => {
            const sourceNode = nodeInternals.get(edge.source);
            const targetNode = nodeInternals.get(edge.target);
            if (!sourceNode || !targetNode) return null;

            const internalsSymbol = Symbol.for('internals');
            // @ts-ignore
            const sourceInternals = sourceNode[internalsSymbol];
            // @ts-ignore
            const targetInternals = targetNode[internalsSymbol];

            const sw = sourceNode.width || 200;
            const sh = sourceNode.height || 100;
            const tw = targetNode.width || 200;
            const th = targetNode.height || 100;

            const sx = sourceNode.positionAbsolute?.x ?? sourceNode.position.x;
            const sy = sourceNode.positionAbsolute?.y ?? sourceNode.position.y;
            const tx = targetNode.positionAbsolute?.x ?? targetNode.position.x;
            const ty = targetNode.positionAbsolute?.y ?? targetNode.position.y;

            let sourceX = sx + sw;
            let sourceY = sy + sh / 2;
            let targetX = tx;
            let targetY = ty + th / 2;

            const sourceBounds = sourceInternals?.handleBounds?.source;
            if (sourceBounds && sourceBounds.length > 0) {
                const handle = edge.sourceHandle ? sourceBounds.find((h: any) => h.id === edge.sourceHandle) : sourceBounds[0];
                if (handle) {
                    sourceX = sx + handle.x + handle.width / 2;
                    sourceY = sy + handle.y + handle.height / 2;
                }
            }

            const targetBounds = targetInternals?.handleBounds?.target;
            if (targetBounds && targetBounds.length > 0) {
                const handle = edge.targetHandle ? targetBounds.find((h: any) => h.id === edge.targetHandle) : targetBounds[0];
                if (handle) {
                    targetX = tx + handle.x + handle.width / 2;
                    targetY = ty + handle.y + handle.height / 2;
                }
            }

            const [path] = getBezierPath({
                sourceX,
                sourceY,
                sourcePosition: Position.Right,
                targetX,
                targetY,
                targetPosition: Position.Left,
                curvature: 0.25,
            });

            return { 
                id: edge.id, 
                path, 
                sourceX, sourceY, targetX, targetY,
                color: getEdgeColor(edge.sourceHandle, edge.targetHandle) 
            };
        }).filter(Boolean) as any[];
    }, [edges, nodeInternals]);

    useEffect(() => {
        const inject = () => {
            const wrapper = wrapperRef.current;
            if (!wrapper) return;

            const svg = wrapper.querySelector('.react-flow__minimap svg');
            if (!svg) return;

            const old = svg.querySelector('.minimap-edges-layer');
            if (old) old.remove();

            if (edgeData.length === 0) return;

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'minimap-edges-layer');

            // 1. Create Defs for glow, gradient, texture
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            
            edgeData.forEach((ed) => {
                // Glow Filter
                const glowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
                glowFilter.setAttribute('id', `minimap-wireGlow-${ed.id}`);
                glowFilter.setAttribute('x', '-70%');
                glowFilter.setAttribute('y', '-70%');
                glowFilter.setAttribute('width', '240%');
                glowFilter.setAttribute('height', '240%');
                glowFilter.innerHTML = `
                    <feGaussianBlur stdDeviation="6" result="softGlow"/>
                    <feMerge>
                        <feMergeNode in="softGlow"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                `;
                defs.appendChild(glowFilter);

                // Gradient
                const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
                gradient.setAttribute('id', `minimap-wireGradient-${ed.id}`);
                gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
                gradient.setAttribute('x1', ed.sourceX.toString());
                gradient.setAttribute('y1', ed.sourceY.toString());
                gradient.setAttribute('x2', ed.targetX.toString());
                gradient.setAttribute('y2', ed.targetY.toString());
                gradient.innerHTML = `
                    <stop offset="0%" stop-color="${WIRE_WARM}" stop-opacity="0.76"/>
                    <stop offset="16%" stop-color="${WIRE_CORE}" stop-opacity="0.98"/>
                    <stop offset="52%" stop-color="${WIRE_HIGHLIGHT}" stop-opacity="1"/>
                    <stop offset="84%" stop-color="${WIRE_CORE}" stop-opacity="0.98"/>
                    <stop offset="100%" stop-color="${WIRE_WARM}" stop-opacity="0.78"/>
                `;
                defs.appendChild(gradient);
            });
            g.appendChild(defs);

            // 2. Create Paths exactly like CustomEdge.tsx but without vector-effect (so they scale)
            edgeData.forEach((ed) => {
                // Outline
                const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                outline.setAttribute('d', ed.path);
                outline.setAttribute('stroke', 'rgba(0, 0, 0, 0.82)');
                outline.setAttribute('stroke-width', '6.9');
                outline.setAttribute('fill', 'none');
                outline.setAttribute('stroke-linecap', 'round');
                outline.setAttribute('stroke-linejoin', 'round');
                outline.style.pointerEvents = 'none';
                g.appendChild(outline);

                // Glow path
                const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                glow.setAttribute('d', ed.path);
                glow.setAttribute('stroke', 'rgba(255, 250, 239, 0.52)');
                glow.setAttribute('stroke-width', '5.15');
                glow.setAttribute('fill', 'none');
                glow.setAttribute('stroke-linecap', 'round');
                glow.setAttribute('stroke-linejoin', 'round');
                glow.setAttribute('opacity', '0.22');
                glow.style.filter = `url(#minimap-wireGlow-${ed.id})`;
                glow.style.pointerEvents = 'none';
                g.appendChild(glow);

                // Core cable
                const core = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                core.setAttribute('d', ed.path);
                core.setAttribute('stroke', `url(#minimap-wireGradient-${ed.id})`);
                core.setAttribute('stroke-width', '2.85');
                core.setAttribute('fill', 'none');
                core.setAttribute('stroke-linecap', 'round');
                core.setAttribute('stroke-linejoin', 'round');
                core.style.pointerEvents = 'none';
                g.appendChild(core);

                // Highlight inner core
                const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                highlight.setAttribute('d', ed.path);
                highlight.setAttribute('stroke', 'rgba(255, 255, 255, 0.68)');
                highlight.setAttribute('stroke-width', '0.82');
                highlight.setAttribute('fill', 'none');
                highlight.setAttribute('stroke-linecap', 'round');
                highlight.setAttribute('stroke-linejoin', 'round');
                highlight.setAttribute('opacity', '0.32');
                highlight.style.mixBlendMode = 'screen';
                highlight.style.pointerEvents = 'none';
                g.appendChild(highlight);
                
                // Add the colorful socket ring to source and target ends
                const sourceRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                sourceRing.setAttribute('cx', ed.sourceX.toString());
                sourceRing.setAttribute('cy', ed.sourceY.toString());
                sourceRing.setAttribute('r', '6');
                sourceRing.setAttribute('fill', '#050505');
                sourceRing.setAttribute('stroke', ed.color);
                sourceRing.setAttribute('stroke-width', '2');
                g.appendChild(sourceRing);

                const targetRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                targetRing.setAttribute('cx', ed.targetX.toString());
                targetRing.setAttribute('cy', ed.targetY.toString());
                targetRing.setAttribute('r', '6');
                targetRing.setAttribute('fill', '#050505');
                targetRing.setAttribute('stroke', ed.color);
                targetRing.setAttribute('stroke-width', '2');
                g.appendChild(targetRing);
            });

            const maskPath = svg.querySelector('.react-flow__minimap-mask');
            if (maskPath) {
                svg.insertBefore(g, maskPath);
            } else {
                svg.appendChild(g);
            }
        };

        const raf = requestAnimationFrame(inject);
        return () => cancelAnimationFrame(raf);
    }, [edgeData]);

    return (
        <div ref={wrapperRef} style={{ display: 'contents' }}>
            <MiniMap
                nodeColor={nodeColor}
                nodeComponent={nodeComponent}
                maskColor={maskColor}
                className={className}
                style={style}
                zoomable={zoomable}
                pannable={pannable}
            />
        </div>
    );
});

MiniMapWithEdges.displayName = 'MiniMapWithEdges';
