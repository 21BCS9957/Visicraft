import 'server-only';

import axios from 'axios';
import sharp from 'sharp';
import { classifyGeminiError, PlaygroundGenerationError } from './gemini';
import { blendPainted, prepareMask, tintPainted } from './maskBlend';
import { apiImageSize, type PlaygroundModelId, type PlaygroundSize } from '@/lib/playground/models';

export { closestRatio, sizeForImage } from '@/lib/playground/models';

export type AiEditMode = 'remove' | 'replace';

async function download(url: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: 30_000, maxContentLength: 60 * 1024 * 1024 });
  return Buffer.from(response.data);
}

/** The image sent to Gemini: at most 2560 px on the long edge, as JPEG. */
async function forGemini(image: sharp.Sharp): Promise<string> {
  const bytes = await image
    .clone()
    .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();
  return bytes.toString('base64');
}

/**
 * Removes (or replaces) what the user painted. Gemini sees the image and a copy with the
 * painted area tinted magenta; its answer is then blended back through a widened, softened
 * mask, so every pixel outside the painted area stays exactly as it was.
 */
export async function aiEditImage(options: {
  baseUrl: string;
  mask: Buffer;
  mode: AiEditMode;
  instruction?: string;
  model: PlaygroundModelId;
  size: PlaygroundSize;
  aspectRatio: string;
  deadline: number;
}): Promise<{ bytes: Buffer; mimeType: string; width: number; height: number; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new PlaygroundGenerationError('paused', 'GEMINI_API_KEY is not configured on the server.');

  const original = await download(options.baseUrl);
  // Decoded once to lossless PNG: re-saving a JPEG would already alter the untouched pixels.
  const baseBytes = await sharp(original, { failOn: 'none' }).rotate().png({ compressionLevel: 2 }).toBuffer();
  const base = sharp(baseBytes, { failOn: 'none' });
  const { width = 0, height = 0 } = await base.metadata();
  if (!width || !height) throw new PlaygroundGenerationError('failed', "The image couldn't be read.");

  const mask = await prepareMask(options.mask, width, height);
  if (!mask.painted) throw new PlaygroundGenerationError('failed', 'Paint over the area to change first.');
  const highlighted = sharp(await tintPainted(baseBytes, mask.widened, width, height));

  const task = options.mode === 'remove'
    ? 'Remove everything inside the magenta area shown in the second image. Fill that area so it continues the surrounding background naturally: the same surfaces, textures, lighting, shadows and perspective, as if the removed thing had never been there. Do not add anything new and do not add text.'
    : `Inside the magenta area shown in the second image only, change it to: ${options.instruction?.trim() || 'something that fits the scene'}. Blend it naturally with the lighting, perspective and style of the rest of the image.`;

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: 'Image 1 is the photo to edit:' },
        { inlineData: { mimeType: 'image/jpeg', data: await forGemini(base) } },
        { text: 'Image 2 is the same photo with the area to edit tinted magenta:' },
        { inlineData: { mimeType: 'image/jpeg', data: await forGemini(highlighted) } },
        { text: `${task}\nReturn the whole photo of image 1 with the same framing, size and composition. Keep everything outside the magenta area exactly the same. The final image must not contain any magenta tint.` },
      ],
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: options.aspectRatio, imageSize: apiImageSize(options.size) },
    },
  };

  const remaining = options.deadline - Date.now() - 20_000;
  if (remaining < 30_000) throw new PlaygroundGenerationError('timeout', 'Gemini took too long on this edit. Try again.');
  let data: {
    candidates?: Array<{ content?: { parts?: Array<{ thought?: boolean; text?: string; inlineData?: { data?: string } }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`,
      body,
      { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, timeout: Math.min(180_000, remaining), maxBodyLength: Infinity, maxContentLength: Infinity }
    );
    data = response.data;
  } catch (error) {
    throw classifyGeminiError(error);
  }
  if (data.promptFeedback?.blockReason) {
    throw new PlaygroundGenerationError('blocked', "Gemini's safety filters blocked this edit. Try a different instruction.");
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const answer = [...parts].reverse().find((part) => part.inlineData?.data && !part.thought);
  if (!answer?.inlineData?.data) {
    const reason = data.candidates?.[0]?.finishReason ?? '';
    if (/SAFETY|PROHIBITED|BLOCKLIST/.test(reason)) {
      throw new PlaygroundGenerationError('blocked', "Gemini's safety filters blocked this edit. Try a different instruction.");
    }
    throw new PlaygroundGenerationError('no_image', `Gemini returned no image${reason ? ` (${reason})` : ''}. Try again.`);
  }

  // Blend Gemini's answer into the original only where the user painted.
  // Lossless, so several edits in a row never degrade the untouched pixels.
  const bytes = await blendPainted(baseBytes, Buffer.from(answer.inlineData.data, 'base64'), mask.feathered, width, height, 'png');

  const usage = data.usageMetadata;
  const inputTokens = Number(usage?.promptTokenCount) || 0;
  const outputTokens = Number(usage?.candidatesTokenCount) || 0;
  return {
    bytes,
    mimeType: 'image/png',
    width,
    height,
    usage: { inputTokens, outputTokens, totalTokens: Number(usage?.totalTokenCount) || inputTokens + outputTokens },
  };
}
