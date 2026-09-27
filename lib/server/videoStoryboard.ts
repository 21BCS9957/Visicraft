import { requestGeminiText } from '@/lib/banana/api';
import { productBrief, type ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import type { AdDesign } from '@/lib/server/metaAdResearch';
import type { ProviderUsage } from '@/lib/server/usage';

/** A beat of the storyboard for our own video ad. */
export interface StoryboardShot {
  t: string;
  action: string;
  camera: string;
  purpose: string;
}

export interface VideoStoryboard {
  hook: string;
  shots: StoryboardShot[];
  mood: string;
  /** Advertiser whose winning sequence this storyboard is modelled on. */
  modelledOn?: string;
  /** Final prompt for the video model. */
  prompt: string;
  negativePrompt: string;
}

/** Belt and braces for sensitive products: strip words that trip the video model's policy filter. */
function neutralise(text: string): string {
  return text
    .replace(/\b(lingerie|underwear|bodysuit|teddy|babydoll)\b/gi, 'garment')
    .replace(/\b(sexy|sensual|seductive|sultry|provocative|alluring)\b/gi, 'elegant')
    .replace(/\b(intimate|intimacy)\b/gi, 'delicate')
    .replace(/\b(bedroom|boudoir)\b/gi, 'room')
    .replace(/\b(body|skin|curves)\b/gi, 'form');
}

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

/** The video model animates from an exact product frame; the prompt must never ask it to redraw the product. */
const PRODUCT_LOCK_FOR_VIDEO = 'The first frame is the real product and its scene. The product in frame is the hero and must remain pixel-identical for the whole clip: same design, text, colours, shape and proportions. Never rotate it past a gentle angle, never occlude its front, never morph, regenerate or restyle it, and add no on-screen text, captions, logos or subtitles anywhere. Sound: natural ambient sound and a soft, warm music bed only; no dialogue, no voice-over, no spoken or sung words.';

function fallbackStoryboard(context: ShopifyProductContext | undefined, durationSeconds: number): VideoStoryboard {
  const name = clean(context?.title, 120) || 'the product';
  return {
    hook: 'Slow reveal of the product in a warm, real setting',
    shots: [
      { t: '0-2s', action: `Tight, slightly out-of-focus detail of ${name}'s setting that snaps into focus`, camera: 'slow push-in', purpose: 'hook' },
      { t: '2-5s', action: 'The package stands hero, light rakes across it, a subtle prop suggests the benefit', camera: 'gentle orbit', purpose: 'reveal' },
      { t: `5-${durationSeconds}s`, action: 'Settle on the package, front-facing, calm and bright', camera: 'ease to static', purpose: 'CTA moment' },
    ],
    mood: 'warm, premium, calm',
    prompt: `Vertical 9:16 Meta Reels product ad, ${durationSeconds} seconds. Open on a shallow-focus detail that snaps into focus, then a slow push-in and gentle orbit toward the package standing hero in warm, realistic light, ending front-facing and still. Photoreal, smooth motion, no on-screen text. ${PRODUCT_LOCK_FOR_VIDEO}`,
    negativePrompt: 'text, captions, subtitles, logos, watermark, warped packaging, morphing, extra products, hands covering the product, flicker, low quality',
  };
}

/**
 * Writes a storyboard for our product modelled on the longest-running video ads in
 * the niche, then compiles it into the prompt for the video model. Falls back to a
 * safe generic storyboard so video generation never blocks on planning.
 */
export async function planVideoStoryboard(options: {
  context?: ShopifyProductContext;
  identityManifest?: string;
  userDirection?: string;
  adPatterns?: string;
  winningDesigns?: AdDesign[];
  durationSeconds?: number;
  /** Intimate wear and similar: no person in the clip, neutral wording, camera and light motion only. */
  sensitive?: boolean;
}): Promise<{ storyboard: VideoStoryboard; usage?: ProviderUsage }> {
  const durationSeconds = options.durationSeconds ?? 8;
  const designs = (options.winningDesigns ?? []).filter((d) => d.sequence?.length).slice(0, 3);
  const designBlock = designs.length
    ? `\nWINNING VIDEO ADS IN THIS NICHE (longest-running first; model the STRUCTURE and PACING, never the brand, wording or claims):\n${designs
        .map((d, i) => `#${i + 1} (${d.daysRunning} days live) format: ${d.format}; hook: ${d.hook}; audio: ${d.audio || 'n/a'}; sequence: ${(d.sequence ?? []).map((b) => `[${b.t}] ${b.shot}${b.camera ? ` (${b.camera})` : ''}${b.purpose ? ` → ${b.purpose}` : ''}`).join(' | ')}`)
        .join('\n')}\nModel the storyboard on #1 and set "modelledOn" to 1.\n`
    : '';

  try {
    const { response, providerModel } = await requestGeminiText(
      [{
        text: `You are a senior Meta video creative director for Indian D2C brands. Write a ${durationSeconds}-second, vertical 9:16 Reels ad storyboard for this product, then compile it into one prompt for an image-to-video model.

${productBrief(options.context)}
Product identity notes: ${clean(options.identityManifest, 1200) || 'n/a'}
${options.userDirection ? `User direction: ${clean(options.userDirection, 600)}` : ''}
${options.adPatterns ? `\nWHAT THE LONGEST-RUNNING ADS IN THIS NICHE DO:\n${clean(options.adPatterns, 1800)}\n` : ''}${designBlock}
Hard rules for the video model:
- The clip starts from a supplied first frame: the real product standing in a scene. Every shot keeps that package pixel-identical, front-facing and unobstructed; no morphing, no restyling, no extra products.
- No on-screen text, captions, subtitles or logos (the model cannot render text reliably); the storyboard's "text" beats become visual beats instead.
- One continuous clip: describe camera motion as smooth moves and light changes, not hard cuts, since the model renders a single shot. Suggest at most one subtle transition.
- Photoreal, Indian setting where a setting is visible, realistic light; only claims supported by the product context.
- The first 1.5 seconds must be a scroll-stopping hook (motion, reveal, contrast), the middle a benefit moment, the end a calm front-facing product hold.
- The model generates sound: describe natural ambience and a soft music mood in the prompt; never dialogue, voice-over or lyrics.
- This is a paid ad that must earn its spend: every beat either stops the scroll, makes the promise visible, or builds desire for the product; nothing decorative.${options.sensitive ? `
- CONTENT POLICY (strict): the first frame shows the product with no person, and no person appears at any point. Motion comes only from the camera and the light (slow push-in, gentle orbit, a warm light sweep, the sheen moving across the fabric). Refer to the product only as "the garment" or "the set"; never use words such as lingerie, underwear, sexy, sensual, seductive, intimate, bedroom, boudoir, body or skin.` : ''}

Return JSON only:
{"hook":"one sentence","shots":[{"t":"0-2s","action":"","camera":"","purpose":""}],"mood":"","modelledOn":1,"prompt":"the final prompt, 90-160 words, present tense, concrete, in shot order","negativePrompt":"comma-separated things to avoid"}`,
      }],
      { temperature: 0.6 },
      'Video storyboard planning'
    );
    const raw = response.data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter((t): t is string => typeof t === 'string').join('') ?? '';
    const json = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
    const parsed = JSON.parse(json.slice(json.indexOf('{'), json.lastIndexOf('}') + 1)) as Record<string, unknown>;
    const shots = (Array.isArray(parsed.shots) ? parsed.shots : [])
      .map((shot) => {
        const s = (shot && typeof shot === 'object' ? shot : {}) as Record<string, unknown>;
        const action = clean(s.action, 220);
        return action ? { t: clean(s.t, 12) || '?', action, camera: clean(s.camera, 80), purpose: clean(s.purpose, 40) } : null;
      })
      .filter((shot): shot is StoryboardShot => shot !== null)
      .slice(0, 8);
    const prompt = options.sensitive ? neutralise(clean(parsed.prompt, 1400)) : clean(parsed.prompt, 1400);
    if (!prompt || shots.length === 0) throw new Error('Storyboard response was incomplete');
    const modelledIndex = Number(parsed.modelledOn);
    const modelled = designs[(Number.isInteger(modelledIndex) && modelledIndex >= 1 ? modelledIndex - 1 : 0)];

    const meta = response.data.usageMetadata;
    const inputTokens = Number(meta?.promptTokenCount) || 0;
    const outputTokens = Number(meta?.candidatesTokenCount) || 0;
    return {
      storyboard: {
        hook: clean(parsed.hook, 200),
        shots,
        mood: clean(parsed.mood, 120),
        modelledOn: modelled?.pageName,
        prompt: `${prompt} ${PRODUCT_LOCK_FOR_VIDEO}`,
        negativePrompt: clean(parsed.negativePrompt, 300) || 'text, captions, subtitles, logos, watermark, warped packaging, morphing, extra products, flicker, low quality',
      },
      usage: { inputTokens, outputTokens, totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens, providerModel },
    };
  } catch (error) {
    console.warn('Video storyboard planning failed, using fallback:', error);
    const fallback = fallbackStoryboard(options.context, durationSeconds);
    return { storyboard: options.sensitive ? { ...fallback, prompt: neutralise(fallback.prompt) } : fallback };
  }
}
