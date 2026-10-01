import type { FabricObject } from 'fabric';

export type Tool = 'select' | 'text' | 'shapes' | 'image' | 'adjust' | 'erase' | 'replace';
export type ShapeKind = 'rect' | 'rounded' | 'pill' | 'circle' | 'line';
export type TextPreset = 'headline' | 'subline' | 'body' | 'price' | 'cta';

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
}

export const NO_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, saturation: 0, blur: 0 };

/** What an edited image keeps so it can be reopened with editable layers. */
export interface CanvasDoc {
  version: 1;
  width: number;
  height: number;
  /** The photo under the layers (the original, or the result of AI edits). */
  baseUrl: string;
  adjustments: Adjustments;
  objects: Record<string, unknown>[];
}

/** Our extra properties on Fabric objects (saved with the design). */
export interface LayerProps {
  name?: string;
  fontKey?: string;
  isMask?: boolean;
  userLocked?: boolean;
}

export type Layer = FabricObject & LayerProps;

export interface EditorApi {
  width: number;
  height: number;
  /** Bumped on every change so panels re-read the canvas. */
  version: number;
  active: Layer | null;
  layers: Layer[];
  addText: (preset: TextPreset) => Promise<void>;
  addShape: (kind: ShapeKind) => void;
  addImage: (file: File) => Promise<void>;
  update: (props: Record<string, unknown>, target?: Layer | null) => void;
  setFont: (key: string) => Promise<void>;
  duplicate: () => Promise<void>;
  remove: (target?: Layer | null) => void;
  forward: (target?: Layer | null) => void;
  backward: (target?: Layer | null) => void;
  toggleLock: (target?: Layer | null) => void;
  toggleVisible: (target: Layer) => void;
  select: (target: Layer) => void;
  adjustments: Adjustments;
  setAdjustments: (next: Adjustments) => void;
}
