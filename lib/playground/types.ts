/** Rows and API shapes of the Playground, shared by the page and the server. */

import type { PlaygroundModelId, PlaygroundSize, ReferenceRole, ThinkingLevel } from './models';

export type ItemStatus = 'queued' | 'generating' | 'done' | 'failed' | 'cancelled';

export interface PlaygroundSettings {
  model: PlaygroundModelId;
  size: PlaygroundSize;
  ratios: string[];
  variations: number;
  thinking: ThinkingLevel;
}

export interface PlaygroundProjectSummary {
  id: string;
  name: string;
  coverUrl: string | null;
  imageCount: number;
  referenceCount: number;
  updatedAt: string;
}

export interface PlaygroundProject {
  id: string;
  name: string;
  brief: string;
  settings: Partial<PlaygroundSettings>;
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
