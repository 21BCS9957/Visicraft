import sharp from 'sharp';
import { imageToBase64 } from '@/lib/banana/api';
import { uploadBufferToBucket } from '@/lib/server/supabaseStorage';

/**
 * Exact-garment frames. An image model cannot redraw an intricate garment on a new pose
 * without changing it, and asked to "extend" a photo to another format it zooms out and
 * invents the rest of the garment. So the store photo of the model wearing the product is
 * placed, at its own scale, on a canvas of the target format, and the model only paints the
 * empty strips (and, optionally, a new background). Person and garment keep their pixels.
 */

export type FrameFormat = '9:16' | '3:4' | '4:5' | '1:1' | '16:9';

const RATIOS: Record<FrameFormat, number> = { '9:16': 9 / 16, '3:4': 3 / 4, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };

/** Share of added height that goes above the photo: a little headroom, the rest continues the garment. */
const HEADROOM_SHARE = 0.35;

/** Average colour of a region, used to fill the strips so they read as more of the same wall. */
async function regionColour(image: Buffer, region: { left: number; top: number; width: number; height: number }) {
  const { data } = await sharp(image).extract(region).resize(1, 1).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

/** Formats an edit that keeps the photo's own shape may snap to (3:4 is only a target format). */
const NATIVE_FORMATS: FrameFormat[] = ['9:16', '4:5', '1:1', '16:9'];

/** The frame format closest to a photo's own shape, for an edit that should not reframe it. */
export async function closestFormat(photoUrl: string): Promise<FrameFormat> {
  const dataUrl = await imageToBase64(photoUrl);
  const meta = await sharp(Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')).metadata();
  const ratio = (meta.width ?? 0) / (meta.height || 1);
  return NATIVE_FORMATS.reduce((best, format) => (Math.abs(RATIOS[format] - ratio) < Math.abs(RATIOS[best] - ratio) ? format : best));
}

/**
 * The store photo on a canvas of the target format, at its own scale. Returns the photo's
 * URL untouched when it already has that shape.
 */
export async function buildExactCanvas(photoUrl: string, format: FrameFormat): Promise<{ url: string; padded: boolean }> {
  const dataUrl = await imageToBase64(photoUrl);
  const photo = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
  const meta = await sharp(photo).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error('Store photo has no size');
  const target = RATIOS[format];
  if (Math.abs(width / height - target) < 0.01) return { url: photoUrl, padded: false };

  const cornerW = Math.max(8, Math.round(width * 0.08));
  const cornerH = Math.max(8, Math.round(height * 0.08));
  let canvasWidth = width;
  let canvasHeight = height;
  let left = 0;
  let top = 0;
  let fill;
  if (width / height > target) {
    // Wider than the format: add height, mostly below so the garment simply continues.
    canvasHeight = Math.round(width / target);
    top = Math.round((canvasHeight - height) * HEADROOM_SHARE);
    const [a, b] = await Promise.all([
      regionColour(photo, { left: 0, top: 0, width: cornerW, height: cornerH }),
      regionColour(photo, { left: width - cornerW, top: 0, width: cornerW, height: cornerH }),
    ]);
    fill = { r: Math.round((a.r + b.r) / 2), g: Math.round((a.g + b.g) / 2), b: Math.round((a.b + b.b) / 2) };
  } else {
    // Narrower than the format: add width on both sides.
    canvasWidth = Math.round(height * target);
    left = Math.round((canvasWidth - width) / 2);
    const [a, b] = await Promise.all([
      regionColour(photo, { left: 0, top: Math.round(height * 0.3), width: cornerW, height: cornerH }),
      regionColour(photo, { left: width - cornerW, top: Math.round(height * 0.3), width: cornerW, height: cornerH }),
    ]);
    fill = { r: Math.round((a.r + b.r) / 2), g: Math.round((a.g + b.g) / 2), b: Math.round((a.b + b.b) / 2) };
  }
  const canvas = await sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 3, background: fill } })
    .composite([{ input: photo, left, top }])
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return { url: await uploadBufferToBucket(canvas, 'generated-thumbnails', 'image/jpeg'), padded: true };
}

/** The edit that turns the canvas into a finished frame without touching the person or the garment. */
export function exactCanvasPrompt(options: {
  padded: boolean;
  /** Short description of the garment (from the garment spec). */
  garment?: string;
  /** A new background from the creative's shot spec; without it the photo's own background is extended. */
  setting?: string;
  /** Ad copy to set in the empty background, when the creative carries text. */
  copy?: string;
}): string {
  return `
${options.padded
    ? `Reference image 1 is a finished photograph placed on a larger canvas of the final format. The flat strips around it are only placeholders.

Paint the placeholder strips as a seamless, natural continuation of the photograph, keeping the framing and the size of the person exactly as they are (do not zoom out, re-compose or move them): continue the background and its light; where the garment meets a strip, let it continue exactly as it already falls, with the same fabric, sheen and border in the same line, and no new motifs, no folds that change the design, no hands and no extra fabric.`
    : 'Reference image 1 is a finished photograph; keep its framing and the size of the person exactly as they are.'}

Everything inside the original photograph stays pixel-faithful: the person's face, features, expression, gaze, hair, jewellery, skin, tattoos, hands and pose, and the whole garment${options.garment ? ` (${options.garment.slice(0, 400)})` : ''} with its exact fabric, colours, sheen, pattern, embroidery and border. Do not redraw, simplify, sharpen, restyle or recolour any of it.

${options.setting
    ? `Background: replace only what is behind the person with ${options.setting.slice(0, 500)}, lit to match the light already on the person (same direction, softness and warmth). The person and everything they wear stay exactly as they are.`
    : 'Background: keep the photograph\'s own background and light; you may add only a very soft, out-of-focus depth that matches the existing light.'}
${options.copy ? `\n${options.copy}\nSet the copy only in the empty background, never over the person or the garment.\n` : '\nAdd no text anywhere.\n'}
The final image must read as one real photograph from edge to edge: no visible seams, bands, borders, colour steps, watermarks or logos.
`.trim();
}

/**
 * Intimate wear worn by a model: video models refuse the person, and a garment redrawn without
 * them loses its lace. Editing the store photo so the person becomes a faceless display
 * mannequin keeps the garment's own pixels and leaves no person in the frame. The edit keeps
 * the photo's own shape: asked to reframe in the same edit, the model leaves bands and moves
 * the pose. extendCanvasPrompt() then takes it to another format when a video needs one.
 */
export function mannequinPrompt(options: {
  /** Short description of the garment (from the garment spec). */
  garment?: string;
}): string {
  return `
Reference image 1 is an e-commerce store photograph of a garment worn by a model.

Edit it: replace the person with a matte ivory display mannequin, a smooth, featureless fibreglass mannequin with a plain egg-shaped head, no face, no hair and no skin texture, standing in exactly the same pose, position and scale, so the garment sits on the mannequin exactly where it sits now.

Keep every part of the garment${options.garment ? ` (${options.garment.slice(0, 400)})` : ''} exactly as it is in the photograph, pixel for pixel: its fabric, lace, embroidery, motifs at the same size, colours, sheen, straps, hardware and trims. Do not redraw, simplify, restyle, recolour, add or remove anything on it.

Keep the room, background, light and camera framing of the photograph unchanged. No person, no face, no skin anywhere. Add no text, logos or watermarks. The result must read as one real photograph of the garment displayed on a mannequin.
`.trim();
}

/** A finished product photograph (no person in it) on a taller canvas: only the strips are painted. */
export function extendCanvasPrompt(): string {
  return `
Reference image 1 is a finished product photograph placed on a larger canvas of the final format. The flat strips around it are only placeholders.

Paint the placeholder strips as a seamless, natural continuation of the photograph: the same room, wall, floor and light, at the same perspective. Keep the photograph's framing and the size of everything in it exactly as they are; do not zoom out, re-compose or move anything. Where the mannequin or the garment meets a strip, let it continue exactly as it already is, with no new fabric, motifs, straps or objects.

Everything inside the original photograph stays pixel-faithful. No person, no face, no hands. Add no text, logos or watermarks. The final image must read as one real photograph from edge to edge: no visible seams, bands, borders or colour steps.
`.trim();
}
