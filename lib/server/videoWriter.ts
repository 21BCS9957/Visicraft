import type { AdDesign } from '@/lib/server/referenceVideos';
import { videoAspectInfo } from '@/lib/videoModels';

/** What Claude is told about the reference videos, and how the approval card credits the prompt. */

/** Who wrote a video prompt, for the approval card, and why a template was used instead. */
export interface VideoWriter {
  writtenBy: string;
  fallbackReason?: string;
}

/** A reference video's frame Claude looks at (never sent to the video engine). */
export interface ReferenceFrame {
  url: string;
  /** e.g. "Reference video A (Serum UGC), frame at 2.0s". */
  label: string;
}

/** The reference videos as Gemini watched them: the timed beats Claude turns into our shot list. */
export function referenceSequences(designs: AdDesign[]): string {
  if (!designs.length) return '';
  return designs
    .map((d, i) => [
      `#${i + 1} "${d.pageName}"${d.style ? ` (${d.style})` : ''}`,
      `format: ${d.format || 'n/a'}; hook: ${d.hook || 'n/a'}; audio: ${d.audio || 'n/a'}`,
      ...(d.sequence ?? []).map((b) => `  [${b.t}] ${b.shot}${b.camera ? ` | camera: ${b.camera}` : ''}${b.text ? ` | on screen: "${b.text}"` : ''}${b.purpose ? ` | ${b.purpose}` : ''}`),
    ].join('\n'))
    .join('\n\n');
}

/** How Claude is told to treat the reference frames it is shown. */
/** The video's shape for a writer's first sentence: "vertical 9:16 ad (Meta Reels and Stories)". */
export function shapeBrief(ratio?: string): string {
  const shape = videoAspectInfo(ratio);
  return `${shape.orientation} ${shape.id} ad (${shape.placement})`;
}

/** How to compose for the shape; nothing for 9:16, which the rest of each brief is written for. */
export function shapeRule(ratio?: string): string {
  switch (videoAspectInfo(ratio).id) {
    case '16:9':
      return 'FRAME: horizontal 16:9. Compose every shot for a wide frame: use the width for the setting or a second subject, place the person or product off-centre where it helps, and keep the product fully inside the frame, never cut by its edges.';
    case '1:1':
      return 'FRAME: square 1:1. Compose every shot for a square frame: the person and the product centred with room around them, nothing important near the edges.';
    case '3:4':
      return 'FRAME: portrait 3:4. Compose every shot for a slightly tall frame: the person and the product centred with a little headroom, nothing important near the edges.';
    default:
      return '';
  }
}

/**
 * How a video writer uses the project's guidelines (a Markdown file the brand adds to the
 * project): brand rules and also any shot-writing method it teaches, such as which lens to
 * name and what must stay in the frame.
 */
export const GUIDELINES_RULE = 'Follow the PROJECT GUIDELINES above in every shot. They are the brand\'s own rules and methods for every video in this project: apply the brand and product facts, the tone, every do and don\'t, and any filmmaking or prompt-writing method they teach (how to describe the framing, the lens or focal length, what must stay visible in the frame, the camera movement) by writing each shot that way. They come before the style defaults below, never before the product, people and safety rules; the client direction for this video comes before them.';

export const REFERENCE_FRAME_RULE = 'The "Reference video" frames are FOR YOUR EYES ONLY: they are not sent to the video model, so never cite them as an Image number. Copy their composition, framing, camera angle, light and pacing; never copy their product, people, logos or text.';

export function writtenByLine(designs: AdDesign[], modelledOn?: string): string {
  if (!designs.length) return 'Written from your product photos';
  return `Written from the shots of your ${designs.length === 1 ? 'reference video' : `${designs.length} reference videos`}${modelledOn && designs.length > 1 ? ` (modelled on "${modelledOn}")` : ''}`;
}
