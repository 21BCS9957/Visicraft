import sharp from 'sharp';
import { imageToBase64, loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import { uploadBufferToBucket } from '@/lib/server/supabaseStorage';
import type { ProviderUsage } from '@/lib/server/usage';

/**
 * Reference images for a Seedance 2.x product film. Seedance 2.x refuses any input that
 * shows a real person, so store photos are checked for people; where the product is worn
 * (a garment on a model) or held, only the product's own regions are cut out and enlarged
 * so its detail reads (the border, the main fabric, a sheer layer, the printed box front).
 * This is how the Neeksha film was made: the product is rebuilt from its own photos.
 */

export interface ReferenceImage {
  url: string;
  /** What it shows, in a few words ("zari border close-up", "front of the box"). */
  label: string;
  /** A close-up's original photo and where in it the close-up was cut ([x, y, width, height], 0-1), for the approval card. */
  source?: { url: string; box: [number, number, number, number] };
}

function textOf(response: Awaited<ReturnType<typeof requestGeminiText>>['response']): string {
  return response.data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter((t): t is string => typeof t === 'string').join('') ?? '';
}

function usageOf(response: Awaited<ReturnType<typeof requestGeminiText>>['response'], providerModel: string): ProviderUsage {
  const meta = response.data.usageMetadata;
  const inputTokens = Number(meta?.promptTokenCount) || 0;
  const outputTokens = Number(meta?.candidatesTokenCount) || 0;
  return { inputTokens, outputTokens, totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens, providerModel };
}

function parseJson<T>(raw: string, fallback: T): T {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return fallback;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return fallback;
  }
}

/** Which images show any part of a person, and what each shows of the product. */
export async function inspectReferenceImages(urls: string[]): Promise<{ images: Array<{ url: string; person: boolean; label: string }>; usage?: ProviderUsage }> {
  const { images, sourceIndexes } = await loadPreparedReferences(urls);
  if (images.length === 0) return { images: [] };
  const parts: Parameters<typeof requestGeminiText>[0] = [{
    text: `For each numbered image: does ANY part of a real person show (face, skin, neck, arms, hands, feet, hair)? Mannequins, dolls, toy figures and printed illustrations are not people. Then label in 3-8 words what the image shows of the product (e.g. "front of the box", "toy car side view", "zari border close-up", "sheer fabric drape").
Return JSON only: {"images":[{"index":1,"person":false,"label":""}]}`,
  }];
  images.forEach((image, i) => parts.push({ text: `IMAGE ${i + 1}:` }, { inlineData: { mimeType: image.mimeType, data: image.data } }));
  const { response, providerModel } = await requestGeminiText(parts, { temperature: 0, responseMimeType: 'application/json' }, 'Reference image check');
  const parsed = parseJson<{ images?: Array<{ index?: number; person?: unknown; label?: unknown }> }>(textOf(response), {});
  return {
    images: images.map((_, i) => {
      const found = parsed.images?.find((entry) => Number(entry.index) === i + 1);
      return {
        url: urls[sourceIndexes[i]],
        // Unknown counts as a person: a refused reference fails the whole video.
        person: found ? found.person !== false : true,
        label: typeof found?.label === 'string' ? found.label.slice(0, 60) : 'product photo',
      };
    }),
    usage: usageOf(response, providerModel),
  };
}

/**
 * Regions of a photo that show only the product (no skin, face, hands or hair), cropped
 * and enlarged: for a garment on a model, its border, main fabric, sheer layers and pattern.
 */
export async function productOnlyCrops(imageUrl: string, options: { garment: boolean; max: number }): Promise<{ crops: ReferenceImage[]; usage?: ProviderUsage }> {
  const dataUrl = await imageToBase64(imageUrl);
  const original = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
  const meta = await sharp(original).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return { crops: [] };

  const { response, providerModel } = await requestGeminiText(
    [
      {
        text: `${options.garment ? 'This photo shows a garment worn by a person.' : 'This photo shows a product with a person in it.'} Find up to ${options.max} rectangles that contain ONLY the ${options.garment ? "garment's fabric" : 'product'} (plain background is fine) and no part of the person: no skin, face, neck, arms, hands, feet, hair or jewellery anywhere inside, not even at the edges. Pick regions that together show the ${options.garment ? "garment's details: the border or trim, the main fabric and its drape, any sheer layer, any woven or printed pattern" : "product's details: its front, its shape, any printed text or logo, its texture"}. Each rectangle must span at least 20% of the image width and 15% of its height.
Return JSON only: {"regions":[{"label":"3-6 words","box_2d":[ymin,xmin,ymax,xmax]}]} with coordinates normalised to 0-1000.`,
      },
      { inlineData: { mimeType: 'image/jpeg', data: dataUrl.split(',')[1] ?? '' } },
    ],
    { temperature: 0, responseMimeType: 'application/json' },
    'Product-only regions'
  );
  const parsed = parseJson<{ regions?: Array<{ label?: unknown; box_2d?: unknown }> }>(textOf(response), {});
  const crops: ReferenceImage[] = [];
  for (const region of (parsed.regions ?? []).slice(0, options.max)) {
    const box = Array.isArray(region.box_2d) ? region.box_2d.map(Number) : [];
    if (box.length !== 4 || !box.every(Number.isFinite)) continue;
    const [ymin, xmin, ymax, xmax] = box.map((n) => Math.max(0, Math.min(1000, n)) / 1000);
    // Shrink slightly, so nothing next to the region (a hand, an arm) creeps in at the edges.
    const insetX = (xmax - xmin) * 0.03;
    const insetY = (ymax - ymin) * 0.03;
    const left = Math.round((xmin + insetX) * width);
    const top = Math.round((ymin + insetY) * height);
    let cropWidth = Math.round((xmax - xmin - 2 * insetX) * width);
    let cropHeight = Math.round((ymax - ymin - 2 * insetY) * height);
    // Seedance takes 0.4-2.5 aspect ratios and at least 300 px a side.
    if (cropWidth / cropHeight < 0.4) cropHeight = Math.floor(cropWidth / 0.4);
    if (cropWidth / cropHeight > 2.5) cropWidth = Math.floor(cropHeight * 2.5);
    if (cropWidth < 160 || cropHeight < 160 || left + cropWidth > width || top + cropHeight > height) continue;
    const scale = Math.min(2, Math.max(1, 1200 / Math.max(cropWidth, cropHeight)));
    const buffer = await sharp(original)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(Math.max(300, Math.round(cropWidth * scale)), Math.max(300, Math.round(cropHeight * scale)), { kernel: 'lanczos3', fit: 'fill' })
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
    const share = (value: number, of: number) => Number((value / of).toFixed(4));
    crops.push({
      url: await uploadBufferToBucket(buffer, 'generated-thumbnails', 'image/jpeg'),
      label: typeof region.label === 'string' ? region.label.slice(0, 60) : 'product detail',
      source: { url: imageUrl, box: [share(left, width), share(top, height), share(cropWidth, width), share(cropHeight, height)] },
    });
  }
  return { crops, usage: usageOf(response, providerModel) };
}

/**
 * The references for a Seedance 2.x product film, at most `max`: person-free store photos as
 * they are, then product-only crops of photos where the product is worn or held, each
 * checked again for people.
 */
export async function buildSeedanceReferences(
  productUrls: string[],
  options: { garment: boolean; max?: number }
): Promise<{ references: ReferenceImage[]; usages: ProviderUsage[] }> {
  const max = options.max ?? 5;
  const usages: ProviderUsage[] = [];
  const inspected = await inspectReferenceImages(productUrls.slice(0, 6));
  if (inspected.usage) usages.push(inspected.usage);
  const references: ReferenceImage[] = inspected.images.filter((image) => !image.person).map(({ url, label }) => ({ url, label }));

  // Worn or held products: cut the product out of the photos that show a person.
  const withPeople = inspected.images.filter((image) => image.person);
  for (const photo of withPeople.slice(0, 2)) {
    if (references.length >= Math.min(max, 4)) break;
    const cropped = await productOnlyCrops(photo.url, { garment: options.garment, max: Math.min(3, max - references.length) }).catch((error) => {
      console.warn('Product-only crops failed:', error instanceof Error ? error.message : error);
      return null;
    });
    if (!cropped) continue;
    if (cropped.usage) usages.push(cropped.usage);
    if (cropped.crops.length === 0) continue;
    const checked = await inspectReferenceImages(cropped.crops.map((c) => c.url));
    if (checked.usage) usages.push(checked.usage);
    for (const crop of cropped.crops) {
      if (checked.images.find((image) => image.url === crop.url)?.person === false) references.push(crop);
    }
  }
  return { references: references.slice(0, max), usages };
}
