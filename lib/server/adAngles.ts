import { requestGeminiText } from '@/lib/banana/api';
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
}): Promise<{ angles: AdAngle[]; usage?: ProviderUsage }> {
  const patterns = clean(options.adPatterns, 2500);
  const designs = (options.winningDesigns ?? []).slice(0, 4);
  const designBlock = designs.length
    ? `\nWINNING ADS TO MODEL (longest-running ads selling this category; copy the STRUCTURE, never the brand, wording or claims):\n${designs.map((d, i) => `#${i + 1} (${d.daysRunning} days live) format: ${d.format}; layout: ${d.layout}; hook: ${d.hook}; text: ${d.textPlacement}; mood: ${d.colorMood}; proof/offer: ${d.proofOrOffer}; why it works: ${d.whyItWorks}`).join('\n')}\nAngle N must be modelled on winning ad #N (angle 1 on #1, angle 2 on #2, and so on; if fewer ads than angles, cycle). Put the model's layout and hierarchy into "design" and its number into "modelledOn".\n`
    : '';
  try {
    const { response, providerModel } = await requestGeminiText(
      [{
        text: `You are a senior Meta performance creative strategist for Indian D2C brands. Plan 4 distinct image ad angles for this product.

${productBrief(options.context)}
Product identity notes: ${clean(options.identityManifest, 1500) || 'n/a'}
${options.userDirection ? `User direction: ${clean(options.userDirection, 800)}` : ''}
${patterns ? `\nWHAT THE LONGEST-RUNNING ADS IN THIS NICHE DO (model the structure, never copy brands or wording):\n${patterns}\n` : ''}${designBlock}
Rules:
- Angles 1 and 2 are text-overlay ads: give a headline (max 6 words) and subline (max 8 words). Angles 3 and 4 are clean visual ads: headline and subline must be empty strings.
- Each angle uses a different psychological lever (e.g. core benefit, problem/solution, social/lifestyle, premium/desire).
- Only use claims supported by the product context. Never invent prices, discounts, ratings, review counts, awards, ingredients or medical claims.
- Scene: one or two sentences describing a photoreal set or situation. The product must stand upright, front-facing and unobstructed; people never cover or hold the package in a way that hides its front.
- Copy in simple, punchy English that Indian shoppers use.

Return JSON only:
{"angles":[{"name":"","scene":"","headline":"","subline":"","design":"layout, product placement, text hierarchy and mood to reproduce (2-3 sentences)","modelledOn":1},{...},{...},{...}]}`,
      }],
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
      return {
        name: clean(item.name, 60) || fallback.name,
        scene: scene || fallback.scene,
        headline: slot.withText ? headline || fallback.headline : undefined,
        subline: slot.withText ? clean(item.subline, 70) || (headline ? undefined : fallback.subline) : undefined,
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
