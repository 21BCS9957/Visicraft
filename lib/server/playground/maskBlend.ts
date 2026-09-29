import sharp from 'sharp';

/**
 * The pixel side of AI Erase / Replace: turns the user's brush strokes into a mask, tints
 * the painted area for Gemini, and blends Gemini's answer back only where the user painted.
 * No `@/` imports, so it can be tested with plain node.
 */

export interface PreparedMask {
  /** 0/255: every pixel the brush touched, widened slightly. */
  widened: Buffer;
  /** The widened mask with a soft edge, used as the blend's alpha. */
  feathered: Buffer;
  painted: boolean;
}

const raw = (width: number, height: number) => ({ raw: { width, height, channels: 1 as const } });

export async function prepareMask(maskImage: Buffer, width: number, height: number): Promise<PreparedMask> {
  const edge = Math.max(width, height);
  // Two passes: sharp keeps a single blur per pipeline.
  const widened = await sharp(maskImage, { failOn: 'none' })
    .flatten({ background: '#000000' })
    .resize(width, height, { fit: 'fill' })
    .greyscale()
    .blur(Math.max(0.5, edge / 400))
    .threshold(12)
    .extractChannel(0)
    .raw()
    .toBuffer();
  let painted = false;
  for (let i = 0; i < widened.length; i += 61) {
    if (widened[i] > 127) {
      painted = true;
      break;
    }
  }
  const feathered = await sharp(widened, raw(width, height)).blur(Math.max(0.5, edge / 260)).extractChannel(0).raw().toBuffer();
  return { widened, feathered, painted };
}

/** The photo with the painted area tinted magenta, as JPEG, to show Gemini what to change. */
export async function tintPainted(base: Buffer, widened: Buffer, width: number, height: number): Promise<Buffer> {
  const alpha = await sharp(widened, raw(width, height)).linear(0.6, 0).extractChannel(0).raw().toBuffer();
  const tint = await sharp({ create: { width, height, channels: 3, background: { r: 255, g: 0, b: 255 } } })
    .joinChannel(alpha, raw(width, height))
    .png()
    .toBuffer();
  return sharp(base, { failOn: 'none' }).composite([{ input: tint }]).jpeg({ quality: 92 }).toBuffer();
}

/** Gemini's answer, resized to the photo, laid over it through the feathered mask. */
export async function blendPainted(base: Buffer, answer: Buffer, feathered: Buffer, width: number, height: number, format: 'png' | 'jpeg'): Promise<Buffer> {
  // Separate pipelines again: in one, removeAlpha would also strip the joined mask.
  const rgb = await sharp(answer, { failOn: 'none' }).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const layer = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .joinChannel(feathered, raw(width, height))
    .png()
    .toBuffer();
  // Compositing adds an alpha channel; the photo has none, so drop it again (a second
  // pipeline, because sharp runs removeAlpha before composite within one).
  const merged = await sharp(base, { failOn: 'none' }).composite([{ input: layer }]).png().toBuffer();
  const flat = sharp(merged).removeAlpha();
  return format === 'png'
    ? flat.png().toBuffer()
    : flat.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
}
