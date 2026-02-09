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

export function loadTemplate(templateId: string): { nodes: Node[]; edges: Edge[] } {
  if (templateId === 'custom') {
    return { nodes: [], edges: [] };
  }

  const template = templates[templateId];
  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  return {
    nodes: template.nodes,
    edges: template.edges,
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
