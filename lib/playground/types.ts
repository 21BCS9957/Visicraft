/** Rows and API shapes of the Playground, shared by the page and the server. */

import type { ImageQuality, PlaygroundModelId, PlaygroundSize, ReferenceRole, ThinkingLevel } from './models';

export type ItemStatus = 'queued' | 'generating' | 'done' | 'failed' | 'cancelled';

export interface PlaygroundSettings {
  model: PlaygroundModelId;
  size: PlaygroundSize;
  ratios: string[];
  variations: number;
  thinking: ThinkingLevel;
  /** OpenAI models' quality level; kept while a Gemini model is picked. */
  quality: ImageQuality;
}

export type ProjectKind = 'image' | 'video';

export interface PlaygroundProjectSummary {
  id: string;
  name: string;
  coverUrl: string | null;
  imageCount: number;
  referenceCount: number;
  /** Video projects: how many videos were made in it. */
  videoCount?: number;
  updatedAt: string;
}

/** A video project's product: the store page it came from and/or the user's own photos. */
export interface VideoProjectProduct {
  /** The product link, when there is one. */
  url: string | null;
  title: string | null;
  vendor: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  /** Every photo found on the store page, and the ones picked for videos. */
  storePhotos: string[];
  selected: string[];
  /** Uploaded or Library photos (in our storage). */
  photos: Array<{ url: string; name: string }>;
  /** What the product is, when there is no store link (the name the prompts use). */
  name: string;
}

/** A video project's last choices in New video. */
export interface VideoProjectSettings {
  model: string;
  duration: number;
  quality: string;
  /** The video's shape: 9:16, 16:9, 1:1 or 3:4. */
  aspectRatio?: string;
  style: string;
  /** Library videos whose shots the video copies (Gemini watches them; never sent to the engine). */
  referenceVideoIds: string[];
  notes: string;
}

export interface PlaygroundProject {
  id: string;
  name: string;
  /** The project's Guidelines (Markdown), applied to every image and to Claude's prompts. */
  brief: string;
  /** The .md file the guidelines came from, if uploaded. */
  briefName: string | null;
  /** Image projects hold the composer's choices; video projects their product and New video choices. */
  settings: Partial<PlaygroundSettings> & { product?: VideoProjectProduct; video?: VideoProjectSettings };
  kind: ProjectKind;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlaygroundReference {
  id: string;
  url: string;
  role: ReferenceRole;
  label: string;
  enabled: boolean;
  width: number | null;
  height: number | null;
  sourceItemId: string | null;
  createdAt: string;
}

export interface ReferenceSnapshot {
  id: string;
  url: string;
  role: ReferenceRole;
  label: string;
}

export interface PlaygroundRun {
  id: string;
  model: PlaygroundModelId;
  size: PlaygroundSize;
  ratios: string[];
  variations: number;
  thinking: ThinkingLevel | null;
  /** OpenAI models only. */
  quality: ImageQuality | null;
  brief: string;
  references: ReferenceSnapshot[];
  prompts: string[];
  imageCount: number;
  creditsPerImage: number;
  cancelledAt: string | null;
  createdAt: string;
}

export interface PlaygroundItem {
  id: string;
  runId: string | null;
  kind: 'generated' | 'edit';
  parentItemId: string | null;
  position: number;
  promptIndex: number | null;
  aspectRatio: string;
  variation: number;
  status: ItemStatus;
  imageUrl: string | null;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
  favorite: boolean;
  attempts: number;
  hasCanvas: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface PlaygroundBundle {
  project: PlaygroundProject;
  references: PlaygroundReference[];
  runs: PlaygroundRun[];
  items: PlaygroundItem[];
  /** Older runs exist; pass this as `before` to load them. */
  nextBefore: string | null;
  /** Credits returned by the stale-image sweep when the project was opened. */
  refunded: number;
}

/** What the generate route answers, beside the item itself. */
export type GenerateOutcome =
  | 'done'
  | 'failed'
  | 'rate_limited'
  | 'paused'
  | 'insufficient_credits'
  | 'not_claimable';

export interface GenerateResponse {
  outcome: GenerateOutcome;
  item?: PlaygroundItem;
  message?: string;
  retryAfterMs?: number;
  needed?: number;
  balance?: number;
}

/** An image or a guideline document in the user's Library, reusable in any project. */
export type LibraryKind = 'image' | 'document' | 'video';

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  name: string;
  url: string | null;
  /** Documents: the first few hundred characters (the full text comes from GET /library/[id]). */
  preview: string | null;
  /** Documents: length in characters. */
  length: number | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  sizeBytes: number | null;
  source: 'upload' | 'generated' | 'project';
  createdAt: string;
  /** The folder it is filed in; null when it isn't filed. */
  folderId: string | null;
  /** Videos: a still for the tile and the length in seconds. */
  posterUrl: string | null;
  durationSeconds: number | null;
  /** Videos: what Gemini saw when it watched the video; null until then. */
  analysis: LibraryVideoAnalysis | null;
}

/** A Library video as Gemini watched it: its timed shot sequence and how it is built. */
export interface LibraryVideoAnalysis {
  format: string;
  hook: string;
  style: string | null;
  audio: string | null;
  brief: string;
  sequence: Array<{ t: string; shot: string; camera?: string; text?: string; purpose?: string }>;
  analyzedAt: string;
}

/** A folder in one Library tab. */
export interface LibraryFolder {
  id: string;
  kind: LibraryKind;
  name: string;
  /** Items filed in it. */
  count: number;
  createdAt: string;
}
