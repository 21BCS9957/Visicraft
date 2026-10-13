import 'server-only';

import sharp from 'sharp';
import { requestGeminiText } from '@/lib/banana/api';
import type { TextBand } from '@/lib/playground/resize';
import type { RgbImage } from './resizeImage';

/**
 * Where an ad's readable text sits, so "Keep clear of Reels buttons" can slide the image until
 * that text is visible: one quick look by Gemini's cheap text model (a few paise, ~2 s).
 */

const PROMPT = `This is an advertising image for social media. Find every element a viewer must be able to read: the headline and any other text set on the image, prices, offers and discount badges, logos and brand names placed on the image, buttons, ratings and review cards, and captions.
Do not include writing that is printed on a product, its packaging or clothing (it is part of the product), or writing in the background scene (signs, books, screens).
Return JSON only: {"items":[{"what":"headline","box_2d":[ymin,xmin,ymax,xmax]}]} with coordinates normalised to 0-1000. Return {"items":[]} when there is no such element.`;

/** The text band (shares of the image's height), or null when there is no text to keep clear. Throws when Gemini can't be asked. */
export async function findTextBand(image: RgbImage): Promise<TextBand | null> {
  const jpeg = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 3 } })
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const { response } = await requestGeminiText(
    [{ text: PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } }],
    { temperature: 0, responseMimeType: 'application/json' },
    'Ad text boxes',
    [],
    30_000
  );
  const raw = response.data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter((text): text is string => typeof text === 'string').join('') ?? '';
  const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1) || '{}') as { items?: Array<{ box_2d?: unknown }> };
  if (!Array.isArray(parsed.items)) throw new Error('Gemini answered without boxes.');
  const boxes = parsed.items
    .map((item) => (Array.isArray(item.box_2d) ? item.box_2d.map(Number) : []))
    .filter((box) => box.length === 4 && box.every((n) => Number.isFinite(n)))
    .map(([ymin, , ymax]) => [Math.max(0, Math.min(1000, ymin)) / 1000, Math.max(0, Math.min(1000, ymax)) / 1000])
    .filter(([top, bottom]) => bottom > top);
  if (!boxes.length) return null;
  return { top: Math.min(...boxes.map(([top]) => top)), bottom: Math.max(...boxes.map(([, bottom]) => bottom)) };
}
