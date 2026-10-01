import { CLAUDE_VIDEO_MODEL_NAME } from '@/lib/server/claude';
import type { AdDesign } from '@/lib/server/metaAdResearch';

/** What Claude is told about the winning videos, and how the approval card credits the prompt. */

/** Who wrote a video prompt, for the approval card, and why a template was used instead. */
export interface VideoWriter {
  writtenBy: string;
  fallbackReason?: string;
}

/** Winning videos as Gemini watched them: the timed beats Claude turns into our shot list. */
export function winnerSequences(designs: AdDesign[]): string {
  if (!designs.length) return '';
  return designs
    .map((d, i) => [
      `#${i + 1} ${d.pageName} (${d.daysRunning} days live${d.style ? `, ${d.style}` : ''})`,
      `format: ${d.format || 'n/a'}; hook: ${d.hook || 'n/a'}; audio: ${d.audio || 'n/a'}`,
      ...(d.sequence ?? []).map((b) => `  [${b.t}] ${b.shot}${b.camera ? ` | camera: ${b.camera}` : ''}${b.text ? ` | on screen: "${b.text}"` : ''}${b.purpose ? ` | ${b.purpose}` : ''}`),
    ].join('\n'))
    .join('\n\n');
}

export function writtenByLine(designs: AdDesign[], modelledOn?: string): string {
  if (!designs.length) return `Written by ${CLAUDE_VIDEO_MODEL_NAME} from your product photos`;
  return `Written by ${CLAUDE_VIDEO_MODEL_NAME} from the shot sequences of ${designs.length} winning video${designs.length === 1 ? '' : 's'}${modelledOn ? ` (modelled on ${modelledOn})` : ''}`;
}
