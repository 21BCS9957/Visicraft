/** Creative style of a video ad. The user picks one; "any" follows the first reference video. */
export type VideoStyle = 'ugc' | 'talking_head' | 'demo' | 'cinematic' | 'any';

/** Styles Gemini can classify a reference video as ("any" is only a user choice). */
export type ClassifiedVideoStyle = Exclude<VideoStyle, 'any'> | 'other';

export const VIDEO_STYLES: Array<{ id: VideoStyle; label: string; description: string }> = [
  { id: 'ugc', label: 'UGC review', description: 'A real customer on their phone, trying it and talking about it' },
  { id: 'talking_head', label: 'Talking head', description: 'A founder, expert or presenter speaks straight to camera' },
  { id: 'demo', label: 'Product demo', description: 'Hands-on: the product in use, up close' },
  { id: 'cinematic', label: 'Cinematic brand film', description: 'Polished lifestyle shots and music, no talking' },
  { id: 'any', label: 'Like my reference video', description: 'The style of your first reference video; a cinematic film when there is none' },
];

export function parseVideoStyle(raw: unknown): VideoStyle | undefined {
  return VIDEO_STYLES.find((style) => style.id === raw)?.id;
}

export function videoStyleLabel(style?: string): string {
  if (style === 'other') return 'Other';
  return VIDEO_STYLES.find((s) => s.id === style)?.label ?? 'Video';
}

/** Styles where a person speaks on camera, so the clip carries a spoken line. */
export function isSpeakingStyle(style?: string): boolean {
  return style === 'ugc' || style === 'talking_head';
}
