/**
 * A garment in a generated frame often keeps its colour and cut but loses its exact pattern
 * (diagonal floral bands become a uniform grid). Rather than re-rendering the whole scene,
 * the frame is edited: only the fabric pattern and embroidery are repainted from the real
 * garment's photo and enlarged detail crops, following the frame's own folds and light.
 */
export function garmentRepairPrompt(options: { issue?: string; productSpec?: string }): string {
  return `
Edit reference image 1 so the garment in it matches our real garment exactly.
${options.issue ? `The product check found: ${options.issue.replace(/\s+/g, ' ').trim().slice(0, 400)}\n` : ''}${options.productSpec ? `\nGARMENT SPEC - the details to reproduce exactly:\n${options.productSpec.slice(0, 3500)}\n` : ''}
Repaint only the garment's fabric pattern, weave, embroidery and border from the real garment's photos (reference images 2 onward): the same motif types, motif sizes, arrangement and colours, wrapped naturally around the folds, drape and lighting already in image 1.
Keep everything else in image 1 exactly as it is: the person, face, hair, expression, pose, hands, jewellery, background, lighting, colour grade, framing and camera. Add no text, logos, borders or padding; output the same full-bleed frame.
`.trim();
}

/**
 * The exact-garment frame: the store photo of a model wearing the garment is edited, not
 * redrawn. The person and everything they wear keep their pixels; only the setting, light
 * and framing follow the creative's shot spec. Image models reproduce colour and cut of a
 * redrawn garment but not an intricate weave, so this is how the design stays exact.
 */
export function exactGarmentFramePrompt(options: {
  shot?: Record<string, unknown>;
  brief?: string;
  /** e.g. "full length" or "from the knees up"; the pose itself never changes. */
  framing?: string;
  format?: string;
}): string {
  const field = (key: string) => (typeof options.shot?.[key] === 'string' ? (options.shot[key] as string) : '');
  const setting = field('setting') || options.brief || 'a warm, elegant real Indian interior';
  return `
Edit reference image 1 into a ${options.format ?? '9:16'} ad frame.
Keep the person and everything they wear exactly as in image 1: face, hair, expression, pose, hands, jewellery, and the whole garment with its exact fabric, colours, pattern, embroidery and border, pixel-faithful.
Change only the surroundings and light:
- Setting: ${setting.slice(0, 600)}
${field('lighting') ? `- Lighting: ${field('lighting').slice(0, 400)}, with only a subtle, natural adjustment of the light on the person\n` : ''}${field('colour_grade') ? `- Colour grade of the scene: ${field('colour_grade').slice(0, 250)}; the garment keeps its own colours\n` : ''}${field('mood') ? `- Mood: ${field('mood').slice(0, 120)}\n` : ''}- Framing: ${options.framing || 'full length'}, the person as the clear hero; extend the scene naturally to fill the ${options.format ?? '9:16'} frame.
A real photograph: correct perspective and shadows on the floor, the person believably standing in the new place. No borders, padding, blur bands, text or logos.
`.trim();
}
