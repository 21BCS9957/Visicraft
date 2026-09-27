import { loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import type { AdAngle, ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import type { ProviderUsage } from '@/lib/server/usage';
import { isSpeakingStyle, videoStyleLabel } from '@/lib/videoStyles';

/**
 * Scores a finished creative the way a paid-social buyer would before spending on
 * it. A weak score triggers one regeneration with the judge's fixes appended to the
 * prompt, which lifts quality without changing the image model.
 */
export interface AdVerdict {
  passed: boolean;
  score: number;
  scores: Record<'thumbStop' | 'clarity' | 'productHero' | 'nativeFeel' | 'craft', number> & { referenceMatch?: number };
  critical: string[];
  fixes: string;
  usage: ProviderUsage;
}

export const JUDGE_PASS_SCORE = 7;

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 0;
}

export async function judgeAdCreative(options: {
  imageUrl: string;
  context?: ShopifyProductContext;
  angle: AdAngle;
  withText: boolean;
  productKind?: 'packaged' | 'apparel' | 'object';
  /** The winning ad this creative mirrors: scored for how closely layout, light and type follow it. */
  referenceImageUrl?: string;
  /** Set when the image is the first frame of a video in this style. */
  videoStyle?: string;
}): Promise<AdVerdict> {
  const { images } = await loadPreparedReferences(
    options.referenceImageUrl ? [options.imageUrl, options.referenceImageUrl] : [options.imageUrl]
  );
  const hasReference = images.length > 1;
  const copyLines = [
    options.angle.kicker ? `kicker "${clean(options.angle.kicker, 80)}"` : '',
    `headline "${clean(options.angle.headline, 80)}"`,
    options.angle.subline ? `supporting line "${clean(options.angle.subline, 90)}"` : '',
    options.angle.cta ? `button "${clean(options.angle.cta, 30)}"` : '',
  ].filter(Boolean).join(', ');
  // A person who will speak on camera needs their face in frame, whatever the reference crops.
  const speakingFrame = isSpeakingStyle(options.videoStyle)
    ? `\nThis image is the first frame of a ${videoStyleLabel(options.videoStyle)} video in which the person speaks to the camera, so their face must stay fully visible and facing the lens. Never suggest cropping out, turning away or hiding the face${options.referenceImageUrl ? '; referenceMatch judges the setting, light and styling, not the crop' : ''}.`
    : '';
  // A garment is framed no tighter than its store photos show it, so fine patterns are copied, not invented.
  const garmentScale = options.productKind === 'apparel'
    ? `\nThe garment is deliberately framed no tighter than its product photos show it, so its patterns are copied rather than invented. Never ask for a tighter crop or a close-up of the garment${options.referenceImageUrl ? '; referenceMatch judges setting, light and styling, not how tight the crop is' : ''}.`
    : '';
  const expectedCopy = options.withText
    ? `Expected on-image copy, and the only words allowed outside the product itself: ${copyLines}.`
    : 'This creative is meant to carry NO text at all.';
  const { response, providerModel } = await requestGeminiText(
    [
      {
        text: `You are the head of performance creative at a top Indian D2C agency, deciding whether this Meta ad image is worth putting media spend behind. Judge it as a buyer, not as an artist.

Product: ${clean(options.context?.title, 140) || 'unknown'}${options.context?.vendor ? ` by ${clean(options.context.vendor, 60)}` : ''}.
Intended angle: ${clean(options.angle.name, 60)} — ${clean(options.angle.scene, 300)}
${expectedCopy}${speakingFrame}${garmentScale}

Score 0-10 on each:
- thumbStop: would an Indian shopper scrolling Instagram stop on this within one second? (contrast, focal point, hook)
- clarity: is the promise/benefit understood at a glance, and is any text exactly the expected copy, legible on a phone, not overlapping the product?
- productHero: ${options.productKind === 'apparel' ? 'is the garment clearly the hero, fully visible on the model, its fit and details readable, tastefully shot?' : 'is the package clearly the hero, large, sharp, unobstructed, believable in the scene (contact shadow, matching light)?'}
- nativeFeel: does it look like a real ad from a real brand in India rather than generic stock or obvious AI?
- craft: photographic quality; no artifacts (deformed hands/faces, warped props, floating objects, extra limbs, gibberish text, seams around the product).
${hasReference ? `- referenceMatch: image 2 is the winning ad this creative was meant to follow. How closely does image 1 follow its composition and framing, camera angle, lighting and colour grade of the scene, and text treatment (font style, size, case, placement)? The product (including its colours), the person, the words and the brand are meant to differ; judge only the layout and style.
` : ''}
Set "critical" to a list of any deal-breakers (e.g. "deformed hand", "headline unreadable", "product cut off", "gibberish text", "product too small", "padded band": part of the frame filled with a blurred, stretched or duplicated strip along an edge); otherwise an empty list. Any overlaid ad copy, caption, button or logo beyond the expected copy${hasReference ? ' (for example a line or logo copied from image 2)' : ''} is a deal-breaker: add "unexpected text: <the words>". Print on the product itself and incidental scene text, such as a distant sign, do not count.
"fixes": 2-4 concrete, specific instructions an image model can apply to fix the weakest points (composition, light, scale, text placement), max 60 words. Never ask to change the product's own colours, fabric, pattern or design, or to grade them toward another look: the product must stay true to its photos. Never ask for a logo, brand name or URL to be added${hasReference ? ', or for anything that identifies image 2\'s brand or model' : ''}.

Return JSON only: {"thumbStop":0,"clarity":0,"productHero":0,"nativeFeel":0,"craft":0,${hasReference ? '"referenceMatch":0,' : ''}"critical":[],"fixes":""}${hasReference ? '\nWhen referenceMatch is below 7, the fixes must name the specific layout or typography differences to correct.' : ''}`,
      },
      { text: 'IMAGE 1 - THE CREATIVE TO JUDGE:' },
      { inlineData: { mimeType: images[0].mimeType, data: images[0].data } },
      ...(hasReference
        ? [{ text: 'IMAGE 2 - THE WINNING AD IT SHOULD FOLLOW:' }, { inlineData: { mimeType: images[1].mimeType, data: images[1].data } }]
        : []),
    ],
    { temperature: 0 },
    'Ad creative review'
  );
  const raw = response.data.candidates?.[0]?.content?.parts?.map((p) => p.text).filter((t): t is string => typeof t === 'string').join('') ?? '';
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  const start = json.indexOf('{');
  const end = json.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Ad creative review returned malformed JSON.');
  const parsed = JSON.parse(json.slice(start, end + 1)) as Record<string, unknown>;

  const scores = {
    thumbStop: num(parsed.thumbStop),
    clarity: num(parsed.clarity),
    productHero: num(parsed.productHero),
    nativeFeel: num(parsed.nativeFeel),
    craft: num(parsed.craft),
    ...(hasReference ? { referenceMatch: num(parsed.referenceMatch) } : {}),
  };
  // Weighted toward what actually drives paid performance; following the proven winner counts too.
  const score = Math.round((hasReference
    ? scores.thumbStop * 0.25 + scores.clarity * 0.2 + scores.productHero * 0.15 + scores.nativeFeel * 0.1 + scores.craft * 0.1 + (scores.referenceMatch ?? 0) * 0.2
    : scores.thumbStop * 0.3 + scores.clarity * 0.25 + scores.productHero * 0.2 + scores.nativeFeel * 0.1 + scores.craft * 0.15
  ) * 10) / 10;
  const critical = Array.isArray(parsed.critical) ? parsed.critical.map((c) => clean(c, 80)).filter(Boolean).slice(0, 5) : [];
  const meta = response.data.usageMetadata;
  const inputTokens = Number(meta?.promptTokenCount) || 0;
  const outputTokens = Number(meta?.candidatesTokenCount) || 0;
  return {
    passed: critical.length === 0 && score >= JUDGE_PASS_SCORE,
    score,
    scores,
    critical,
    fixes: clean(parsed.fixes, 400),
    usage: { inputTokens, outputTokens, totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens, providerModel },
  };
}
