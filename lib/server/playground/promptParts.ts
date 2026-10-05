import 'server-only';

import { loadReferenceImage } from './references';
import { PlaygroundGenerationError } from './errors';
import { ROLE_LABELS, type ReferenceRole } from '@/lib/playground/models';
import type { ReferenceSnapshot } from '@/lib/playground/types';

/**
 * The words every image model gets around the pictures: the project's guidelines, each
 * reference numbered with its role, the rules per role, and the prompt. Gemini gets them
 * between its image parts; OpenAI gets them as one prompt with the images attached in order.
 */

const ROLE_ORDER: ReferenceRole[] = ['product', 'person', 'style'];

const ROLE_RULES: Record<ReferenceRole, (images: string) => string> = {
  product: (images) =>
    `${images} show the product. Reproduce it exactly: the same shape, proportions, colours, materials, logo, printed text and every detail. Do not redesign, recolour or simplify it.`,
  person: (images) =>
    `${images} show the person to feature. Keep their face, hair and identity exactly; pose, outfit and expression may follow the prompt.`,
  style: (images) =>
    `${images} are style references: match their lighting, colour grade, composition and mood, but do not copy their products, people, logos or text.`,
};

function imageList(numbers: number[]): string {
  if (numbers.length === 1) return `Image ${numbers[0]}`;
  return `Images ${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
}

/** The references in the order they are numbered: products, then people, then styles. */
export function orderedReferences(references: ReferenceSnapshot[]): ReferenceSnapshot[] {
  return ROLE_ORDER.flatMap((role) => references.filter((reference) => reference.role === role));
}

/** Loads every reference; one that can't be read fails the image rather than silently vanishing. */
export async function loadReferences(references: ReferenceSnapshot[]) {
  return Promise.all(references.map(async (reference) => {
    try {
      return { reference, image: await loadReferenceImage(reference.url) };
    } catch {
      const name = reference.label || ROLE_LABELS[reference.role].toLowerCase();
      throw new PlaygroundGenerationError('bad_reference', `A reference image (${name}) couldn't be read. Remove it or upload it again.`);
    }
  }));
}

export function guidelinesText(brief: string): string | null {
  const text = brief.trim();
  return text
    ? `Project guidelines (Markdown). Follow them for every image in this project; the prompt at the end describes this particular image:\n${text}`
    : null;
}

/** "Image 2 (Product: front view):" */
export function referenceLabel(reference: ReferenceSnapshot, number: number): string {
  const label = reference.label.trim();
  return `Image ${number} (${ROLE_LABELS[reference.role]}${label ? `: ${label}` : ''}):`;
}

/** One rule line per role present, naming its image numbers (references already in `orderedReferences` order). */
export function roleRules(ordered: ReferenceSnapshot[]): string {
  const numbersByRole: Record<ReferenceRole, number[]> = { product: [], person: [], style: [] };
  ordered.forEach((reference, index) => numbersByRole[reference.role].push(index + 1));
  return ROLE_ORDER
    .filter((role) => numbersByRole[role].length)
    .map((role) => ROLE_RULES[role](imageList(numbersByRole[role])))
    .join('\n');
}

export function promptText(prompt: string): string {
  return `Create this image:\n${prompt.trim()}`;
}
