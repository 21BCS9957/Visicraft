import { Node, Edge } from 'reactflow';

/** Deterministic order: sort edges by id so multiple reference inputs are stable. */
export function collectReferenceImageUrls(
  edges: Edge[],
  nodes: Node[],
  generateNodeId: string
): string[] {
  const incoming = edges.filter(
    (e) => e.target === generateNodeId && e.targetHandle === 'referenceImage'
  );
  const sorted = [...incoming].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const urls: string[] = [];
  for (const edge of sorted) {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    if (!sourceNode?.data) continue;
    const d = sourceNode.data as Record<string, unknown>;
    const url = (d.supabaseUrl || d.generatedImage || d.imageUrl) as string | undefined;
    if (typeof url === 'string' && url.length > 0) urls.push(url);
  }
  return urls;
}
