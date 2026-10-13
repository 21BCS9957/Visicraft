import { ROLE_LABELS, type ReferenceRole } from './models';
import type { ReferenceSnapshot } from './types';

/**
 * The words every image model gets around the pictures: the project's guidelines, each
 * reference numbered with its role, the rules per role, and the prompt. Gemini gets them
 * between its image parts; OpenAI gets them as one prompt with the images attached in order.
 * Free of server code, so the Composer can measure what GPT Image will be sent.
 */

type Reference = Pick<ReferenceSnapshot, 'role' | 'label'>;

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
export function orderedReferences<T extends Reference>(references: T[]): T[] {
  return ROLE_ORDER.flatMap((role) => references.filter((reference) => reference.role === role));
}

export function guidelinesText(brief: string): string | null {
  const text = brief.trim();
  return text
    ? `Project guidelines (Markdown). Follow them for every image in this project; the prompt at the end describes this particular image:\n${text}`
    : null;
}

/** "Image 2 (Product: front view):" */
export function referenceLabel(reference: Reference, number: number): string {
  const label = reference.label.trim();
  return `Image ${number} (${ROLE_LABELS[reference.role]}${label ? `: ${label}` : ''}):`;
}

/** One rule line per role present, naming its image numbers (references already in `orderedReferences` order). */
export function roleRules(ordered: Reference[]): string {
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

/** GPT Image reads a prompt of at most 32,000 characters (guidelines and reference labels included). */
export const OPENAI_PROMPT_LIMIT = 32_000;

/** What GPT Image gets before the prompt: the guidelines and the numbered references. */
function openAiLead(brief: string, references: Reference[]): string[] {
  const ordered = orderedReferences(references);
  const labels = ordered.length
    ? ['Reference images, attached in this order:', ...ordered.map((reference, index) => referenceLabel(reference, index + 1)), roleRules(ordered)].join('\n')
    : null;
  return [guidelinesText(brief), labels].filter((part): part is string => Boolean(part));
}

/** The one prompt GPT Image is sent for an image: the guidelines, the numbered references and the image's prompt. */
export function openAiPrompt(brief: string, references: Reference[], prompt: string): string {
  return [...openAiLead(brief, references), promptText(prompt)].join('\n\n');
}

/**
 * A prompt's length as OpenAI counts it. With reference images it goes as a form field, and a
 * form sends every line break as two characters (\r\n), so those count twice: on 12 real
 * refusals this matched OpenAI's numbers exactly.
 */
export function openAiPromptLength(prompt: string, withImages: boolean): number {
  return withImages ? prompt.length + (prompt.match(/\n/g)?.length ?? 0) : prompt.length;
}

/** The longest prompt GPT Image would be sent for these prompts, counted as OpenAI counts it. */
export function longestOpenAiPrompt(brief: string, references: Reference[], prompts: string[]): number {
  const withImages = references.length > 0;
  const lead = openAiPromptLength(openAiLead(brief, references).map((part) => `${part}\n\n`).join(''), withImages);
  return prompts.reduce((longest, prompt) => Math.max(longest, lead + openAiPromptLength(promptText(prompt), withImages)), 0);
}

/** Why GPT Image can't take it, with the numbers and what to do instead. */
export function openAiTooLongMessage(brief: string, length: number): string {
  const n = (value: number) => value.toLocaleString('en-IN');
  const guidelines = brief.trim().length;
  const over = length - OPENAI_PROMPT_LIMIT;
  if (!guidelines) return `Too long for GPT Image: it reads at most ${n(OPENAI_PROMPT_LIMIT)} characters per image and this prompt comes to ${n(length)}. Shorten it by about ${n(over)} characters.`;
  return `Too long for GPT Image: it reads at most ${n(OPENAI_PROMPT_LIMIT)} characters per image, and with "Send with every image" on, this project's guidelines (${n(guidelines)} characters) go with every prompt, which makes ${n(length)}. Turn that off in Guidelines (Claude still follows them when it writes prompts), shorten them by about ${n(over)} characters, or use a Nano Banana model.`;
}
