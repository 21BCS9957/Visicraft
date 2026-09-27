import sharp from 'sharp';
import { imageToBase64, loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import { uploadBufferToBucket } from '@/lib/server/supabaseStorage';
import type { ProviderUsage } from '@/lib/server/usage';
import { PROMPT_WRITER_MODELS } from '@/lib/server/writerModels';

/**
 * A technical spec of a garment's patterns, written from its store photos. Image and video
 * models copy fine detail loosely (a dense all-over floral becomes large medallions), so
 * every prompt and the product check name exactly what must be reproduced and what the
 * wrong versions look like.
 */

export interface GarmentSpec {
  /** Compact JSON for prompts. */
  json: string;
  /** What a shopper recognises the garment by. */
  signature: string[];
  /** Specific wrong versions to avoid. */
  never: string[];
  usage: ProviderUsage;
}

export async function describeGarmentSpec(imageUrls: string[], manifest?: string, labels: string[] = []): Promise<GarmentSpec | null> {
  const { images, sourceIndexes } = await loadPreparedReferences(imageUrls.slice(0, 4));
  if (images.length === 0) return null;
  const parts: Parameters<typeof requestGeminiText>[0] = [{
    text: `You are a textile technical designer writing the spec an image model must follow to reproduce this exact garment. The photos show ONE garment (the first is the main photo; any others are closer views or enlarged crops of it, and they are the best evidence for patterns). Describe only what the photos show; when a detail is too small to read, write "not resolvable" instead of guessing, and only list a "never" item when the photos clearly show the correct version.

For every visible piece (e.g. saree body, pallu, border, blouse, dupatta, sleeves, lining), give:
- fabric: material, weave and finish (sheer, metallic, matte, slub, sheen)
- colours: named colours with approximate hex, and where each sits
- colour_layout: solid, ombre (from what to what, which direction), shot/two-tone, or pattern-led
- pattern: motif type (floral buti, paisley, jaal, geometric, stripe, check, print), technique (woven zari, embroidery, print, sequin), motif size relative to the piece (e.g. "each motif about 1/12 of the blouse width"), density and arrangement (dense all-over, scattered, in rows, diagonal lattice, border-only), motif colours
- edges_and_trims: borders, piping, lace, scallops, tassels, with their width relative to the piece
- construction: neckline, sleeves, cut, pleats, how it is draped or worn in the photos

Then list "signature": the 3-6 details a shopper would recognise this exact garment by, and "never": 5-8 specific wrong versions an image model tends to produce for THIS garment's patterns, covering at least: a motif-size error (e.g. "large medallions instead of the small dense florals"), an arrangement error (e.g. "motifs in horizontal bands instead of all-over"), a simplification error (e.g. "a plain geometric lattice instead of the floral motifs", "a plain gold border without its small flowers"), a colour or finish error (e.g. "flat matte fabric instead of metallic tissue", "the ombre reversed"), and a construction error. Name the real motifs and colours in each.
${manifest ? `\nAnalyst notes on the product (for context):\n${manifest.slice(0, 1500)}\n` : ''}
Return JSON only: {"garment":"one line","pieces":[{"piece":"","fabric":"","colours":[""],"colour_layout":"","pattern":"","edges_and_trims":"","construction":""}],"signature":[""],"never":[""]}`,
  }];
  images.forEach((image, i) => {
    const label = labels[sourceIndexes[i]];
    parts.push(
      { text: sourceIndexes[i] === 0 ? 'MAIN PRODUCT PHOTO:' : `CLOSER VIEW ${i}${label ? ` (${label})` : ''}:` },
      { inlineData: { mimeType: image.mimeType, data: image.data } }
    );
  });
  const { response, providerModel } = await requestGeminiText(
    parts,
    { temperature: 0.1, responseMimeType: 'application/json' },
    'Garment spec',
    PROMPT_WRITER_MODELS
  );
  const raw = response.data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter((t): t is string => typeof t === 'string').join('') ?? '';
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim().slice(0, 160)).slice(0, 8) : []);
  const meta = response.data.usageMetadata;
  const inputTokens = Number(meta?.promptTokenCount) || 0;
  const outputTokens = Number(meta?.candidatesTokenCount) || 0;
  return {
    json: JSON.stringify(parsed).slice(0, 4000),
    signature: list(parsed.signature),
    never: list(parsed.never),
    usage: { inputTokens, outputTokens, totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens, providerModel },
  };
}

/**
 * Zoomed crops of a garment's pattern-carrying pieces (blouse, border, pallu...) cut from
 * the main store photo at full resolution. In a full-length photo those details are a few
 * hundred pixels wide, too small for a model to read; enlarged, they can be described,
 * copied and checked. Returns public URLs of the crops, largest detail first.
 */
export async function cropGarmentDetails(imageUrl: string, maxCrops = 2): Promise<{ crops: Array<{ piece: string; url: string }>; usage?: ProviderUsage }> {
  const dataUrl = await imageToBase64(imageUrl);
  const original = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
  const meta = await sharp(original).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return { crops: [] };

  const { response, providerModel } = await requestGeminiText(
    [
      {
        text: `Find the parts of the garment in this photo whose pattern or embroidery detail matters most for reproducing it exactly (for example the blouse, the border, the pallu, a printed panel, lace, a woven motif area). Ignore the person's face, skin and the background. Return up to ${maxCrops + 1} boxes, most detailed pattern first, each tight around that part.
Return JSON only: {"parts":[{"piece":"blouse","box_2d":[ymin,xmin,ymax,xmax]}]} with coordinates normalised to 0-1000.`,
      },
      { inlineData: { mimeType: 'image/jpeg', data: dataUrl.split(',')[1] ?? '' } },
    ],
    { temperature: 0, responseMimeType: 'application/json' },
    'Garment detail boxes'
  );
  const raw = response.data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter((t): t is string => typeof t === 'string').join('') ?? '';
  const parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1) || '{}') as { parts?: Array<{ piece?: unknown; box_2d?: unknown }> };
  const boxes = (parsed.parts ?? [])
    .map((part) => ({ piece: typeof part.piece === 'string' ? part.piece.slice(0, 40) : 'detail', box: Array.isArray(part.box_2d) ? part.box_2d.map(Number) : [] }))
    .filter((part) => part.box.length === 4 && part.box.every((n) => Number.isFinite(n)))
    .slice(0, maxCrops);

  const crops: Array<{ piece: string; url: string }> = [];
  for (const { piece, box } of boxes) {
    const [ymin, xmin, ymax, xmax] = box.map((n) => Math.max(0, Math.min(1000, n)) / 1000);
    // A little context around the part, and never a sliver.
    const padX = (xmax - xmin) * 0.1;
    const padY = (ymax - ymin) * 0.1;
    const left = Math.max(0, Math.floor((xmin - padX) * width));
    const top = Math.max(0, Math.floor((ymin - padY) * height));
    const cropWidth = Math.min(width - left, Math.ceil((xmax - xmin + 2 * padX) * width));
    const cropHeight = Math.min(height - top, Math.ceil((ymax - ymin + 2 * padY) * height));
    if (cropWidth < 48 || cropHeight < 48) continue;
    // Only worth it when the crop is a real zoom (under about half the photo).
    if (cropWidth * cropHeight > width * height * 0.5) continue;
    const zoomed = await sharp(original)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize({ width: cropWidth >= cropHeight ? 1024 : undefined, height: cropHeight > cropWidth ? 1024 : undefined, kernel: 'lanczos3', withoutEnlargement: false })
      .jpeg({ quality: 93, chromaSubsampling: '4:4:4' })
      .toBuffer();
    crops.push({ piece, url: await uploadBufferToBucket(zoomed, 'generated-thumbnails', 'image/jpeg') });
  }
  const usageMeta = response.data.usageMetadata;
  const inputTokens = Number(usageMeta?.promptTokenCount) || 0;
  const outputTokens = Number(usageMeta?.candidatesTokenCount) || 0;
  return { crops, usage: { inputTokens, outputTokens, totalTokens: Number(usageMeta?.totalTokenCount) || inputTokens + outputTokens, providerModel } };
}
