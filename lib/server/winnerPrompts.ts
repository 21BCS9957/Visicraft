import { loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import { DEFAULT_AD_ANGLES, productBrief, type AdAngle, type ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import type { AdDesign, WinningAd } from '@/lib/server/metaAdResearch';
import type { ProviderUsage } from '@/lib/server/usage';

/**
 * One winning ad in, one generation prompt out. Gemini looks at a proven ad from the
 * niche next to our product and writes the prompt that recreates what makes that ad
 * work, with our product in it. The image model then gets that prompt plus only our
 * product photo, so the competitor's product and branding never reach it.
 */

// The strongest writer on this key (13.7 s on a test prompt vs ~20 s for flash); flash follows as fallback.
const PROMPT_WRITER_MODELS = (process.env.PROMPT_WRITER_MODEL || 'gemini-3.1-pro-preview').split(',').map((m) => m.trim()).filter(Boolean);

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

async function writeOne(options: {
  winner: WinningAd;
  design?: AdDesign;
  productImageUrl: string;
  context?: ShopifyProductContext;
  identityManifest?: string;
  productKind?: 'packaged' | 'apparel' | 'object';
  userDirection?: string;
  /** 0 = the winner's format as it is; 1+ = same format, different moment, for a distinct creative. */
  variation: number;
}): Promise<{ angle: AdAngle; usage: ProviderUsage }> {
  const { winner, design } = options;
  if (!winner.imageUrl) throw new Error('Winner has no image');
  const { images } = await loadPreparedReferences([winner.imageUrl, options.productImageUrl]);
  if (images.length < 2) throw new Error('Could not load the winning ad and the product image');

  const apparel = options.productKind === 'apparel';
  const { response, providerModel } = await requestGeminiText(
    [
      {
        text: `You are the creative director of a top Indian D2C performance agency. Your ads are judged on revenue.

IMAGE A is a Meta ad for a competing product. It has been live for ${winner.daysRunning} days${winner.collationCount > 1 ? ` across ${winner.collationCount} ad variants` : ''} and is still running: the advertiser keeps paying for it, so it sells.${design ? ` Our analyst's read of it: format "${clean(design.format, 120)}"; hook "${clean(design.hook, 160)}"; why it works: ${clean(design.whyItWorks, 200)}` : ''}${winner.mediaKind === 'video' ? ' (Image A is the cover frame of a video ad.)' : ''}
IMAGE B is OUR product: ${productBrief(options.context)}${options.identityManifest ? `\nIdentity notes on our product: ${clean(options.identityManifest, 900)}` : ''}
${options.userDirection ? `Client direction: ${clean(options.userDirection, 400)}\n` : ''}
Write the prompt an image model will use to create OUR ad. Recreate what makes IMAGE A work: its format, composition and framing, camera angle and lens feel, subject and styling, setting, lighting, colour palette, mood, and how big and where the product sits. Put OUR product (IMAGE B, which the image model will receive as its reference) where their product is, and nothing of theirs.

Rules:
- TEXT: look carefully at IMAGE A. If it has no on-image text (no headline or overlay copy; ignore small logos and packaging print), our ad has none: "hasText": false and empty headline/subline. If it carries on-image copy, mirror its structure (placement, amount, hierarchy, type style) with OUR OWN words: headline max 6 words that make a promise or a sharp hook (never just the brand or product name; the pack already shows it), optional subline max 8 words giving the reason to believe, only claims our product context supports. Never reuse their wording, prices, offers or brand.
- Never mention or describe the competitor's brand, logo, product, packaging, watermark or any app/UI chrome.
- ${apparel ? 'Our product is a garment: an adult model wears it exactly as in IMAGE B (colour, fabric, lace/print, cut, trims, closures), shown completely; tasteful editorial styling that complies with Meta policy (no nudity, no sexualised posing).' : 'Our product must appear exactly as in IMAGE B (shape, colours, logo, all printed text); say where it sits, how large, and how it is held or used, and that it stays identical to the reference.'}
- Indian setting and people where the ad has a setting or people; adults only.
- Vertical 9:16; keep the top 14% and bottom 20% free of key elements.
${options.variation > 0 ? `- This is variation #${options.variation + 1} of this format: keep the winning format, but change the moment, setting or action so it is a clearly different creative.\n` : ''}- The prompt: 110-170 words, present tense, concrete, describing the shot for a photoreal image model. No reasoning, no references to "image A" or "the competitor".

Return JSON only: {"name":"2-4 word angle name","promise":"the one promise in the shopper's words","hasText":false,"headline":"","subline":"","format":"format of IMAGE A in <=10 words","prompt":"..."}`,
      },
      { text: 'IMAGE A - WINNING AD:' },
      { inlineData: { mimeType: images[0].mimeType, data: images[0].data } },
      { text: 'IMAGE B - OUR PRODUCT:' },
      { inlineData: { mimeType: images[1].mimeType, data: images[1].data } },
    ],
    { temperature: 0.5 },
    'Winner prompt writing',
    PROMPT_WRITER_MODELS
  );

  const raw = response.data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter((t): t is string => typeof t === 'string').join('') ?? '';
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  const start = json.indexOf('{');
  const end = json.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Prompt writer returned no JSON');
  const parsed = JSON.parse(json.slice(start, end + 1)) as Record<string, unknown>;
  const prompt = clean(parsed.prompt, 1600);
  if (!prompt) throw new Error('Prompt writer returned an empty prompt');
  const headline = clean(parsed.headline, 60);
  const hasText = parsed.hasText === true && Boolean(headline);

  const meta = response.data.usageMetadata;
  const inputTokens = Number(meta?.promptTokenCount) || 0;
  const outputTokens = Number(meta?.candidatesTokenCount) || 0;
  return {
    angle: {
      name: clean(parsed.name, 60) || 'Winning format',
      promise: clean(parsed.promise, 160) || undefined,
      scene: clean(parsed.format, 120) || clean(design?.format, 120) || 'Modelled on a winning ad',
      withText: hasText,
      headline: hasText ? headline : undefined,
      subline: hasText ? clean(parsed.subline, 70) || undefined : undefined,
      brief: prompt,
      modelledOn: winner.pageName,
      referenceImage: winner.imageUrl,
    },
    usage: { inputTokens, outputTokens, totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens, providerModel },
  };
}

/**
 * Prompts for the requested slots, the k-th slot modelled on the k-th winner
 * (cycling with a variation when there are fewer winners than slots). Slots that
 * are not requested keep a default angle so indexes stay stable.
 */
export async function writePromptsFromWinners(options: {
  winners: WinningAd[];
  designs?: AdDesign[];
  slots: number[];
  productImageUrl: string;
  context?: ShopifyProductContext;
  identityManifest?: string;
  productKind?: 'packaged' | 'apparel' | 'object';
  userDirection?: string;
}): Promise<{ angles: AdAngle[]; usages: ProviderUsage[]; failed: number }> {
  // Round-robin by advertiser so four slots come from four different winners when possible.
  const withImages = options.winners.filter((ad) => ad.imageUrl);
  const byPage = new Map<string, WinningAd[]>();
  withImages.forEach((ad) => {
    const key = ad.pageName.toLowerCase();
    byPage.set(key, [...(byPage.get(key) ?? []), ad]);
  });
  const pool: WinningAd[] = [];
  for (let round = 0; pool.length < withImages.length; round++) {
    byPage.forEach((list) => { if (list[round]) pool.push(list[round]); });
  }
  const angles: AdAngle[] = DEFAULT_AD_ANGLES.map((a) => ({ ...a, withText: false }));
  const usages: ProviderUsage[] = [];
  let failed = 0;
  if (pool.length === 0) return { angles, usages, failed: options.slots.length };

  await Promise.all(options.slots.map(async (slot, k) => {
    const winner = pool[k % pool.length];
    const design = options.designs?.find((d) => d.id === winner.id);
    try {
      const written = await writeOne({
        winner,
        design,
        productImageUrl: options.productImageUrl,
        context: options.context,
        identityManifest: options.identityManifest,
        productKind: options.productKind,
        userDirection: options.userDirection,
        variation: Math.floor(k / pool.length),
      });
      angles[slot] = written.angle;
      usages.push(written.usage);
    } catch (error) {
      failed += 1;
      console.warn(`Winner prompt for slot ${slot + 1} (${winner.pageName}) failed:`, error instanceof Error ? error.message : error);
    }
  }));
  return { angles, usages, failed };
}
