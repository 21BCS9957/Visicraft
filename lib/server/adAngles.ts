import { loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import {
  CREATIVE_SLOTS,
  DEFAULT_AD_ANGLES,
  productBrief,
  type AdAngle,
  type ShopifyProductContext,
} from '@/lib/prompts/shopifyCreative';
import type { ProviderUsage } from '@/lib/server/usage';
import type { AdDesign } from '@/lib/server/metaAdResearch';

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

/**
 * Plans four distinct Meta ad angles (slots 1-2 with overlay copy, 3-4 clean).
 * Falls back to generic angles if planning fails, so generation never blocks on it.
 */
export async function planAdAngles(options: {
  context?: ShopifyProductContext;
  identityManifest?: string;
  userDirection?: string;
  adPatterns?: string;
  winningDesigns?: AdDesign[];
  /** The winners' images (or video cover frames): the planner looks at them while writing. */
  winnerImages?: string[];
  productKind?: 'packaged' | 'apparel' | 'object';
}): Promise<{ angles: AdAngle[]; usage?: ProviderUsage }> {
  const patterns = clean(options.adPatterns, 2500);
  const designs = (options.winningDesigns ?? []).slice(0, 4);
  const designBlock = designs.length
    ? `\nWINNING ADS TO MODEL (longest-running ads selling this category; copy the STRUCTURE, never the brand, wording or claims):\n${designs.map((d, i) => `#${i + 1} (${d.daysRunning} days live) format: ${d.format}; layout: ${d.layout}; hook: ${d.hook}; text: ${d.textPlacement}; mood: ${d.colorMood}; proof/offer: ${d.proofOrOffer}; why it works: ${d.whyItWorks}`).join('\n')}\nAngle N must be modelled on winning ad #N (angle 1 on #1, angle 2 on #2, and so on; if fewer ads than angles, cycle). Put the model's layout and hierarchy into "design" and its number into "modelledOn".\n`
    : '';
  const winnerParts: Parameters<typeof requestGeminiText>[0] = [];
  if (options.winnerImages?.length) {
    const { images, sourceIndexes } = await loadPreparedReferences(options.winnerImages.slice(0, 6)).catch(() => ({ images: [], sourceIndexes: [] as number[] }));
    images.forEach((image, i) => {
      const d = designs[sourceIndexes[i]] ?? options.winningDesigns?.[sourceIndexes[i]];
      winnerParts.push(
        { text: `WINNING AD #${sourceIndexes[i] + 1}${d ? ` — ${d.pageName}, live ${d.daysRunning} days` : ''}:` },
        { inlineData: { mimeType: image.mimeType, data: image.data } }
      );
    });
  }
  try {
    const { response, providerModel } = await requestGeminiText(
      [{
        text: `You are a senior Meta performance creative strategist for Indian D2C brands. ${winnerParts.length ? 'The images attached are the longest-running ads in this niche: study how they are built (subject, framing, product size, text or no text, type style, colour, mood, proof) and model our four creatives on what evidently works there.' : ''} Plan 4 distinct image ad creatives for this product; each must be able to earn its media spend.

${productBrief(options.context)}
Product identity notes: ${clean(options.identityManifest, 1500) || 'n/a'}
${options.userDirection ? `User direction: ${clean(options.userDirection, 800)}` : ''}
${patterns ? `\nWHAT THE LONGEST-RUNNING ADS IN THIS NICHE DO (model the structure, never copy brands or wording):\n${patterns}\n` : ''}${designBlock}
These ads exist to make money. Plan them like a direct-response buyer:
- Each angle makes exactly ONE promise, stated in "promise" in the shopper's own words (what changes in their life), and the scene dramatises that promise so it reads with the text removed.
- Use four DIFFERENT proven structures, one per angle, chosen from: problem → relief (show the pain moment resolved), core benefit hero, "moment of use" ritual/lifestyle, before/after or comparison (only if truthful and visual), reason-to-believe (ingredient/mechanism/craft shown), desire/aspiration, objection-buster (address the doubt that stops purchase), gift/occasion. Pick the four that fit this product and niche best; if the winning ads reveal what converts in this niche, prefer those structures.
- ${designs.length || winnerParts.length ? 'Copy is NOT a fixed rule. Decide per creative whether it carries on-image copy by mirroring what the winning ads in this niche do (if most winners use headline overlays, most of ours should; if they are clean product/lifestyle shots, ours are clean). Set "withText" accordingly.' : 'There are no winning ads to mirror, so all four are clean photographs with no on-image text: "withText" false and empty headline/subline.'} When withText is true: headline max 6 words with a concrete promise or a sharp question (no puns, no generic slogans), subline max 8 words giving the reason to believe; when false, headline and subline are empty strings.
- "brief": a complete expert image brief for this creative, 90-140 words, present tense: the subject and setting, exactly where and how large the product sits, the person (if any) and what they do, framing and lens, light, palette and mood, and where any copy goes. Write it the way a top art director briefs a photographer, modelled on the winner you picked, never copying its brand or wording.${options.productKind === 'apparel' ? '\n- This is apparel: the garment is worn by an adult model and must be shown completely and clearly; keep it tasteful and editorial (Meta policy: no nudity, no sexualised posing), and never ask to change the garment.' : ''}
- Only claims the product context supports. Never invent prices, discounts, ratings, review counts, awards, ingredients, results or medical claims.
- Scene: two or three sentences a photographer can shoot: specific Indian setting, time of day, light, the person (if any) and what they are doing, props that carry the promise, where the product stands (upright, front-facing, unobstructed, on a surface). No clichés (no floating products, no abstract gradients, no generic marble).
- Copy in simple, punchy English that Indian shoppers use.

Return JSON only:
{"angles":[{"name":"","promise":"","withText":true,"headline":"","subline":"","brief":"","scene":"one-line summary of the setting","design":"layout, product placement, text hierarchy and mood to reproduce (2-3 sentences)","modelledOn":1},{...},{...},{...}]}`,
      }, ...winnerParts],
      { temperature: 0.7 },
      'Ad angle planning'
    );

    const raw = response.data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => typeof text === 'string')
      .join('') ?? '';
    const json = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
    const parsed = JSON.parse(json.slice(json.indexOf('{'), json.lastIndexOf('}') + 1)) as { angles?: unknown[] };
    const planned = Array.isArray(parsed.angles) ? parsed.angles : [];

    const angles = CREATIVE_SLOTS.map((slot, index) => {
      const item = (planned[index] ?? {}) as Record<string, unknown>;
      const fallback = DEFAULT_AD_ANGLES[index];
      const scene = clean(item.scene, 600);
      const headline = clean(item.headline, 60);
      const modelledIndex = Number(item.modelledOn);
      const modelled = designs.length
        ? designs[(Number.isInteger(modelledIndex) && modelledIndex >= 1 ? modelledIndex - 1 : index) % designs.length]
        : undefined;
      // The planner decides copy per creative; the slot default applies only if it did not say.
      const withText = designs.length === 0 && winnerParts.length === 0
        ? false
        : typeof item.withText === 'boolean' ? item.withText : Boolean(headline) || slot.withText;
      return {
        name: clean(item.name, 60) || fallback.name,
        promise: clean(item.promise, 160) || undefined,
        scene: scene || fallback.scene,
        withText,
        brief: clean(item.brief, 1200) || undefined,
        headline: withText ? headline || fallback.headline : undefined,
        subline: withText ? clean(item.subline, 70) || (headline ? undefined : fallback.subline) : undefined,
        design: clean(item.design, 500) || (modelled ? `${modelled.format}. ${modelled.layout} ${modelled.textPlacement}` : undefined),
        modelledOn: modelled?.pageName,
      };
    });

    const meta = response.data.usageMetadata;
    const inputTokens = Number(meta?.promptTokenCount) || 0;
    const outputTokens = Number(meta?.candidatesTokenCount) || 0;
    return {
      angles,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens,
        providerModel,
      },
    };
  } catch (error) {
    console.warn('Ad angle planning failed, using default angles:', error);
    return { angles: DEFAULT_AD_ANGLES };
  }
}
