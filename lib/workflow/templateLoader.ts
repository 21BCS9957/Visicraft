import { Node, Edge } from 'reactflow';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  nodes: Node[];
  edges: Edge[];
}

// Import all templates
import youtubeTemplate from './templates/youtube-thumbnail.json';
import amazonTemplate from './templates/amazon-creative.json';
import shopifyTemplate from './templates/shopify-creative.json';
import metaTemplate from './templates/meta-ads.json';
import productShowcaseTemplate from './templates/product-showcase.json';
import viralThumbnailTemplate from './templates/viral-thumbnail-factory.json';
import brandUniverseTemplate from './templates/brand-universe-explorer.json';

export const templates: Record<string, WorkflowTemplate> = {
  'youtube-thumbnail': youtubeTemplate as WorkflowTemplate,
  'amazon-creative': amazonTemplate as WorkflowTemplate,
  'shopify-creative': shopifyTemplate as WorkflowTemplate,
  'meta-ads': metaTemplate as WorkflowTemplate,
  'product-showcase': productShowcaseTemplate as WorkflowTemplate,
  'viral-thumbnail-factory': viralThumbnailTemplate as WorkflowTemplate,
  'brand-universe-explorer': brandUniverseTemplate as WorkflowTemplate,
};

export function loadTemplate(templateId: string): { nodes: Node[]; edges: Edge[]; viewport?: { x: number; y: number; zoom: number } } {
  if (templateId === 'custom') {
    return { nodes: [], edges: [] };
  }

  const template = templates[templateId];
  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  // Make node IDs unique per template to prevent state leakage between templates
  const nodeIdMap = new Map<string, string>();
  const uniqueNodes = template.nodes.map(node => {
    const uniqueId = `${templateId}-${node.id}`;
    nodeIdMap.set(node.id, uniqueId);
    return {
      ...node,
      id: uniqueId,
    };
  });

  // Update edge references to use new unique IDs
  const uniqueEdges = template.edges.map(edge => ({
    ...edge,
    id: `${templateId}-${edge.id}`,
    source: nodeIdMap.get(edge.source) || edge.source,
    target: nodeIdMap.get(edge.target) || edge.target,
  }));

  return {
    nodes: uniqueNodes,
    edges: uniqueEdges,
    viewport: (template as any).viewport,
  };
}

export function getTemplateList() {
  return Object.values(templates).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
  }));
}
