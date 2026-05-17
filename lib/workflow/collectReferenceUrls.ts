import { Node, Edge } from 'reactflow';

type NodeData = Record<string, unknown>;

const ASSET_FIELDS = [
  'supabaseUrl',
  'generatedImage',
  'generatedVideo',
  'imageUrl',
  'videoUrl',
  'url',
  'image',
  'video',
] as const;

const UPLOAD_NODE_TYPES = new Set(['import', 'referenceImage', 'sourceImage']);

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

    const sourceUrls = getReferenceAssetUrls(sourceNode);
    for (const url of sourceUrls) {
      if (!urls.includes(url)) urls.push(url);
    }
  }

  if (typeof window !== 'undefined') {
    console.log(
      `📎 [collectReferenceImageUrls] Generate node ${generateNodeId} -> ${urls.length} reference asset(s):`,
      urls
    );
  }

  return urls;
}

export function collectPromptText(
  edges: Edge[],
  nodes: Node[],
  generateNodeId: string
): string | null {
  const incoming = edges.filter(
    (e) => e.target === generateNodeId && e.targetHandle === 'prompt'
  );
  const sorted = [...incoming].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const prompts = sorted
    .map((edge) => nodes.find((n) => n.id === edge.source))
    .map((node) => (node?.data ? getPromptTextFromNode(node.data as NodeData) : null))
    .filter((text): text is string => typeof text === 'string' && text.trim().length > 0);

  return prompts.length > 0 ? prompts.join('\n\n') : null;
}

export function collectGenerationInputs(
  edges: Edge[],
  nodes: Node[],
  generateNodeId: string
) {
  return {
    referenceImageUrls: collectReferenceImageUrls(edges, nodes, generateNodeId),
    promptText: collectPromptText(edges, nodes, generateNodeId),
  };
}

function getReferenceAssetUrls(node: Node): string[] {
  const data = node.data as NodeData;

  if (data.uploadStatus === 'uploading') {
    throw new Error('A connected reference is still uploading. Please wait for it to finish before generating.');
  }

  if (data.status === 'processing') {
    throw new Error('A connected reference node is still generating. Please wait for it to finish.');
  }

  const directUrls = ASSET_FIELDS
    .map((field) => data[field])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const arrayUrls = Array.isArray(data.images)
    ? data.images.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  const urls = [...directUrls, ...arrayUrls];
  if (urls.length > 0) return urls;

  if (UPLOAD_NODE_TYPES.has(String(node.type))) {
    throw new Error('A connected reference node does not have an uploaded image yet.');
  }

  if (node.type === 'generate' || node.type === 'videoGenerate' || node.type === 'output') {
    throw new Error('A connected reference node has no generated asset yet. Run it first, or run the whole workflow.');
  }

  throw new Error('A connected reference node does not provide an image or video asset.');
}

function getPromptTextFromNode(data: NodeData): string | null {
  const promptValue = data.text ?? data.promptText ?? data.prompt;
  return typeof promptValue === 'string' ? promptValue : null;
}
