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
    if (sourceNode.type === 'import' || sourceNode.type === 'referenceImage' || sourceNode.type === 'sourceImage') {
      if (d.uploadStatus === 'uploading') {
        throw new Error('Reference image is still uploading. Please wait for upload to finish before generating.');
      }
      if (d.uploaded !== true || typeof d.supabaseUrl !== 'string' || d.supabaseUrl.length === 0) {
        continue;
      }
      urls.push(d.supabaseUrl);
      continue;
    }
    const url = (d.generatedImage || d.imageUrl) as string | undefined;
    if (typeof url === 'string' && url.length > 0) urls.push(url);
  }

  if (typeof window !== 'undefined') {
    console.log(
      `📎 [collectReferenceImageUrls] Generate node ${generateNodeId} -> ${urls.length} reference URL(s):`,
      urls
    );
  }

  return urls;
}
