import { useState, useCallback, useRef, useEffect } from 'react';
import { Node, Edge } from 'reactflow';

interface HistoryState {
    nodes: Node[];
    edges: Edge[];
}

export function useUndoRedo(
    initialNodes: Node[],
    initialEdges: Edge[],
    setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void,
    setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
) {
    const [past, setPast] = useState<HistoryState[]>([]);
    const [future, setFuture] = useState<HistoryState[]>([]);

    // Track current state separately from React Flow's state to ensure we always have the
    // exact reference of what was last recorded as the 'current' step
    const currentStateRef = useRef<HistoryState>({ nodes: initialNodes, edges: initialEdges });

    // Debounce timeout for automatic snapshots
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Take a manual snapshot. This should be called *before* a major action
    // starts, passing the *current* nodes and edges before they change.
    const takeSnapshot = useCallback((nodes: Node[], edges: Edge[]) => {
        // Save current state to past
        setPast((prev) => [...prev, currentStateRef.current]);
        // A new action means future is invalidated
        setFuture([]);
        // Update our reference of current state
        currentStateRef.current = {
            // Deep clone to prevent references from mutating historical states
            nodes: JSON.parse(JSON.stringify(nodes)),
            edges: JSON.parse(JSON.stringify(edges))
        };
    }, []);

    const undo = useCallback(() => {
        if (past.length === 0) return;

        const previousState = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);

        // Push current to future
        setFuture((prev) => [currentStateRef.current, ...prev]);
        // Set new current
        currentStateRef.current = previousState;
        setPast(newPast);

        // Apply to React Flow (deep clone to avoid reference bugs)
        setNodes(JSON.parse(JSON.stringify(previousState.nodes)));
        setEdges(JSON.parse(JSON.stringify(previousState.edges)));
    }, [past, setNodes, setEdges]);

    const redo = useCallback(() => {
        if (future.length === 0) return;

        const nextState = future[0];
        const newFuture = future.slice(1);

        // Push current to past
        setPast((prev) => [...prev, currentStateRef.current]);
        // Set new current
        currentStateRef.current = nextState;
        setFuture(newFuture);

        // Apply to React Flow
        setNodes(JSON.parse(JSON.stringify(nextState.nodes)));
        setEdges(JSON.parse(JSON.stringify(nextState.edges)));
    }, [future, setNodes, setEdges]);

    // Hook to auto-track changes via debounce to capture intermediate movements/edits.
    // We don't take snapshots of nodes while they are being dragged or selected
    const trackChanges = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        // Don't track if any node is actively dragging
        const isDragging = currentNodes.some(n => n.dragging);
        if (isDragging) return;

        debounceTimeoutRef.current = setTimeout(() => {
            // Compare current nodes/edges to our last tracked state.
            // We stringify the core data (ignoring 'selected' and 'dragging') to see if a real change occurred
            const cleanNodes = currentNodes.map(({ selected, dragging, ...rest }) => rest);
            const cleanEdges = currentEdges.map(({ selected, ...rest }) => rest);

            const lastCleanNodes = currentStateRef.current.nodes.map(({ selected, dragging, ...rest }) => rest);
            const lastCleanEdges = currentStateRef.current.edges.map(({ selected, ...rest }) => rest);

            const hasChanged =
                JSON.stringify(cleanNodes) !== JSON.stringify(lastCleanNodes) ||
                JSON.stringify(cleanEdges) !== JSON.stringify(lastCleanEdges);

            if (hasChanged) {
                // Push the old state to past, make new state current
                setPast((prev) => [...prev, currentStateRef.current]);
                setFuture([]);
                currentStateRef.current = {
                    nodes: JSON.parse(JSON.stringify(currentNodes)),
                    edges: JSON.parse(JSON.stringify(currentEdges))
                };
            }
        }, 500); // 500ms debounce
    }, []);

    // Clear history function
    const clearHistory = useCallback((initialNodes: Node[], initialEdges: Edge[]) => {
        setPast([]);
        setFuture([]);
        currentStateRef.current = {
            nodes: JSON.parse(JSON.stringify(initialNodes)),
            edges: JSON.parse(JSON.stringify(initialEdges))
        };
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
        };
    }, []);

    return {
        undo,
        redo,
        takeSnapshot,
        trackChanges,
        clearHistory,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
    };
}
