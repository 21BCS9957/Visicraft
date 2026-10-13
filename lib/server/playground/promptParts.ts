import 'server-only';

import { loadReferenceImage } from './references';
import { PlaygroundGenerationError } from './errors';
import { ROLE_LABELS } from '@/lib/playground/models';
import type { ReferenceSnapshot } from '@/lib/playground/types';

/**
 * Loading the references for an image. The words around them (guidelines, numbered
 * references, role rules, the prompt) live in lib/playground/promptText.ts, which the
 * Composer shares to measure what GPT Image will be sent.
 */
export { guidelinesText, orderedReferences, promptText, referenceLabel, roleRules } from '@/lib/playground/promptText';

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
