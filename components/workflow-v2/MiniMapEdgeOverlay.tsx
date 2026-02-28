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

const getEdgeColor = (sourceHandle?: string | null, targetHandle?: string | null): string => {
    if (targetHandle === 'referenceImage' || targetHandle === 'sourceImage') return colorMap.reference;
    if (targetHandle === 'prompt') return colorMap.prompt;
    if (targetHandle === 'image') return colorMap.output;
    if (sourceHandle === 'image') return colorMap.image;
    if (sourceHandle === 'prompt') return colorMap.prompt;
    if (sourceHandle === 'generatedImage') return colorMap.output;
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

/**
 * Wrapper around MiniMap that also renders edges.
 * Injects SVG edge paths into the MiniMap's internal SVG element.
 */
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

    // Compute edge SVG paths from node positions using React Flow's internal handleBounds
    const edgePaths = useMemo(() => {
        return edges.map((edge) => {
            const sourceNode = nodeInternals.get(edge.source);
            const targetNode = nodeInternals.get(edge.target);
            if (!sourceNode || !targetNode) return null;

            // React Flow stores exact pixel positions of handles in node[Symbol.for('internals')].handleBounds
            const internalsSymbol = Symbol.for('internals');
            // @ts-ignore - internal React Flow API
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

            // Default fallback positions if handleBounds are missing
            let sourceX = sx + sw;
            let sourceY = sy + sh / 2;
            let targetX = tx;
            let targetY = ty + th / 2;

            // Find exact source handle position
            const sourceBounds = sourceInternals?.handleBounds?.source;
            if (sourceBounds && sourceBounds.length > 0) {
                const handle = edge.sourceHandle ? sourceBounds.find((h: any) => h.id === edge.sourceHandle) : sourceBounds[0];
                if (handle) {
                    sourceX = sx + handle.x + handle.width / 2;
                    sourceY = sy + handle.y + handle.height / 2;
                }
            }

            // Find exact target handle position
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

            return { id: edge.id, path, color: getEdgeColor(edge.sourceHandle, edge.targetHandle) };
        }).filter(Boolean) as { id: string; path: string; color: string }[];
    }, [edges, nodeInternals]);

    // Inject edges into the MiniMap SVG
    useEffect(() => {
        const inject = () => {
            const wrapper = wrapperRef.current;
            if (!wrapper) return;

            const svg = wrapper.querySelector('.react-flow__minimap svg');
            if (!svg) return;

            // Clean up old edges
            const old = svg.querySelector('.minimap-edges-layer');
            if (old) old.remove();

            if (edgePaths.length === 0) return;

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'minimap-edges-layer');

            edgePaths.forEach((ep) => {
                const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                p.setAttribute('d', ep.path);
                p.setAttribute('stroke', ep.color);
                p.setAttribute('stroke-width', '4');
                p.setAttribute('stroke-opacity', '0.85');
                p.setAttribute('fill', 'none');
                p.setAttribute('stroke-linecap', 'round');
                p.setAttribute('stroke-linejoin', 'round');
                p.style.pointerEvents = 'none';
                g.appendChild(p);
            });

            // Insert edge layer directly into the SVG, before the mask path.
            // The MiniMap SVG uses a viewBox in canvas coordinates, and nodes
            // are rendered as direct children (no wrapping <g> transform).
            // Previously, this code searched for a <g transform> which incorrectly
            // matched the first CustomMiniMapNode's <g>, causing an offset.
            const maskPath = svg.querySelector('.react-flow__minimap-mask');
            if (maskPath) {
                svg.insertBefore(g, maskPath);
            } else {
                svg.appendChild(g);
            }
        };

        // Use rAF to ensure the MiniMap SVG has rendered
        const raf = requestAnimationFrame(inject);
        return () => cancelAnimationFrame(raf);
    }, [edgePaths]);

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
