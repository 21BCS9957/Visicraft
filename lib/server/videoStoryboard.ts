import { requestGeminiText } from '@/lib/banana/api';
import { productBrief, type ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import type { AdDesign } from '@/lib/server/metaAdResearch';
import type { ProviderUsage } from '@/lib/server/usage';
import { isSpeakingStyle, type VideoStyle } from '@/lib/videoStyles';

type MadeStyle = Exclude<VideoStyle, 'any'>;

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
  /** The creative style the clip is made in. */
  style?: MadeStyle;
  /** UGC and talking-head clips: the line the person on camera says. */
  script?: string;
  /** Final prompt for the video model. */
  prompt: string;
  negativePrompt: string;
}

/**
 * The style to make: the user's pick, or for "any" the style of the top winning video
 * (as watched during research). Products the video model will not show on a person are
 * always a product-only film.
 */
export function resolveVideoStyle(requested: VideoStyle | undefined, designs: AdDesign[] = [], sensitive = false): MadeStyle {
  if (sensitive) return 'cinematic';
  if (requested && requested !== 'any') return requested;
  const winner = designs.find((d) => d.sequence?.length)?.style;
  return winner === 'ugc' || winner === 'talking_head' || winner === 'demo' || winner === 'cinematic' ? winner : 'cinematic';
}

/** How the hero frame (the clip's first frame) must be staged for the style. */
export function heroFrameDirection(style: MadeStyle, productKind?: 'packaged' | 'apparel' | 'object'): string {
  const garment = productKind === 'apparel';
  const withProduct = garment ? 'wearing the product, shown clearly' : 'holding the product up near their face or chest, its front fully visible to the lens';
  switch (style) {
    case 'ugc':
      return `This image is the first frame of a UGC-style video: an everyday Indian creator filming themselves on a phone at arm's length (front-camera framing, slightly wide lens, natural window light, a real lived-in home), ${withProduct}, looking straight into the lens with a friendly, natural expression, lips closed, about to speak. It must look like a real customer's phone video, not an ad shoot.`;
    case 'talking_head':
      return `This image is the first frame of a talking-head video: one presenter (founder, expert or stylist) framed chest-up at eye level on a steady camera, clean real setting, ${withProduct}, looking straight into the lens with a confident, warm expression, lips closed, about to speak.`;
    case 'demo':
      return `This image is the first frame of a product demo video: the product in use, close up, ${garment ? 'the fabric being draped or held so its drape and detail read clearly' : 'hands about to use it, the product front-facing and unobstructed'}, clean natural light.`;
    default:
      return '';
  }
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
const PRODUCT_LOCK_FOR_VIDEO = 'The first frame is the real product and its scene. The product in frame is the hero and must remain pixel-identical for the whole clip: same design, text, colours, shape and proportions. Never rotate it past a gentle angle, never occlude its front, never morph, regenerate or restyle it, and add no on-screen text, captions, logos or subtitles anywhere.';
const SILENT_SOUND = 'Sound: natural ambient sound and a soft, warm music bed only; no dialogue, no voice-over, no spoken or sung words.';
const speakingSound = (script: string) =>
  `Sound: only the on-camera person's own voice saying exactly "${script}", clear, natural and lip-synced, with light room tone; no music, no other voices.`;

/** How each style is shot, for the storyboard writer. */
const STYLE_DIRECTION: Record<MadeStyle, string> = {
  ugc: 'UGC STYLE: it must look like a real customer\'s phone video, not an ad shoot. Handheld front-camera framing at arm\'s length with slight natural shake, natural daylight, a real Indian home (or wherever the winner films). The person talks to the camera like a friend and shows the product to the lens. One continuous take.',
  talking_head: 'TALKING-HEAD STYLE: one presenter (founder, expert or stylist) framed chest-up at eye level, steady camera with at most a slow push-in, clean real setting, confident and warm delivery straight into the lens. The product stays fully visible in their hands, on them or beside them.',
  demo: 'DEMO STYLE: the product being used up close (hands interacting with it; for a garment, the fabric draped, held up and moving) in a clear chain of motions within one continuous shot, building to the moment the benefit is visible.',
  cinematic: 'CINEMATIC STYLE: a polished, premium brand film: purposeful camera moves, beautiful light, no one addresses the camera.',
};

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
    style: 'cinematic',
    prompt: `Vertical 9:16 Meta Reels product ad, ${durationSeconds} seconds. Open on a shallow-focus detail that snaps into focus, then a slow push-in and gentle orbit toward the package standing hero in warm, realistic light, ending front-facing and still. Photoreal, smooth motion, no on-screen text. ${PRODUCT_LOCK_FOR_VIDEO} ${SILENT_SOUND}`,
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
  /** The user's chosen style ("any" follows the top winning video). */
  style?: VideoStyle;
  productKind?: 'packaged' | 'apparel' | 'object';
}): Promise<{ storyboard: VideoStoryboard; usage?: ProviderUsage }> {
  const durationSeconds = options.durationSeconds ?? 8;
  const designs = (options.winningDesigns ?? []).filter((d) => d.sequence?.length).slice(0, 3);
  const style = resolveVideoStyle(options.style, options.winningDesigns, options.sensitive);
  const speaking = isSpeakingStyle(style);
  const maxWords = Math.max(10, Math.round(durationSeconds * 2.2));
  const designBlock = designs.length
    ? `\nWINNING VIDEO ADS IN THIS NICHE (longest-running first; model the STRUCTURE and PACING, never the brand, wording or claims):\n${designs
        .map((d, i) => `#${i + 1} (${d.daysRunning} days live) format: ${d.format}; hook: ${d.hook}; audio: ${d.audio || 'n/a'}; sequence: ${(d.sequence ?? []).map((b) => `[${b.t}] ${b.shot}${b.camera ? ` (${b.camera})` : ''}${b.purpose ? ` → ${b.purpose}` : ''}`).join(' | ')}`)
        .join('\n')}\nModel the storyboard on #1 and set "modelledOn" to 1.\n`
    : '';

  try {
    const { response, providerModel } = await requestGeminiText(
      [{
        text: `You are a senior Meta video creative director for Indian D2C brands. Write a ${durationSeconds}-second, vertical 9:16 Reels ad storyboard for this product in the style below, then compile it into one prompt for an image-to-video model.

${STYLE_DIRECTION[style]}

${productBrief(options.context)}
Product identity notes: ${clean(options.identityManifest, 1200) || 'n/a'}
${options.userDirection ? `User direction: ${clean(options.userDirection, 600)}` : ''}
${options.adPatterns ? `\nWHAT THE LONGEST-RUNNING ADS IN THIS NICHE DO:\n${clean(options.adPatterns, 1800)}\n` : ''}${designBlock}
Hard rules for the video model:
- The clip starts from a supplied first frame: the real product in its scene${speaking ? ', with the person who will speak' : ''}. Every shot keeps the product pixel-identical${options.productKind === 'apparel' ? ' as worn in that frame' : ', front-facing and unobstructed'}; no morphing, no restyling, no extra products.
- No on-screen text, captions, subtitles or logos (the model cannot render text reliably); the storyboard's "text" beats become visual beats instead.
- One continuous clip: describe camera motion as smooth moves and light changes, not hard cuts, since the model renders a single shot. Suggest at most one subtle transition.
- Photoreal, Indian setting where a setting is visible, realistic light; only claims supported by the product context.
${speaking ? `- The person speaks ONE line, the "script": at most ${maxWords} words so it fits ${durationSeconds} seconds at a natural pace. Its first words are the hook; ${style === 'ugc' ? 'first person, like a real customer talking to a friend ("I\'ve been wearing this...")' : 'the presenter\'s confident voice, speaking to the viewer'}; one concrete benefit; only claims the product context supports; no prices, discounts or competitor names. Language: the spoken language of the winning ad when it is English or Hinglish (write Hinglish in Latin script); otherwise natural Indian English.
- The prompt must contain the script verbatim in double quotes, introduced as who says it, e.g. She looks into the lens and says: "...". The person's lips move in sync; the product stays visible throughout, and the last beat shows it clearly toward the lens.
- The model generates sound: only the person's voice with light room tone; no music, no other voices.
- negativePrompt must never exclude people, faces, speech or voices.` : `- The first 1.5 seconds must be a scroll-stopping hook (motion, reveal, contrast), the middle a benefit moment, the end a calm front-facing product hold.
- The model generates sound: describe natural ambience and a soft music mood in the prompt; never dialogue, voice-over or lyrics.`}
- This is a paid ad that must earn its spend: every beat either stops the scroll, makes the promise visible, or builds desire for the product; nothing decorative.${options.sensitive ? `
- CONTENT POLICY (strict): the first frame shows the product with no person, and no person appears at any point. Motion comes only from the camera and the light (slow push-in, gentle orbit, a warm light sweep, the sheen moving across the fabric). Refer to the product only as "the garment" or "the set"; never use words such as lingerie, underwear, sexy, sensual, seductive, intimate, bedroom, boudoir, body or skin.` : ''}

Return JSON only:
{"hook":"one sentence","shots":[{"t":"0-2s","action":"","camera":"","purpose":""}],"mood":"","modelledOn":1,${speaking ? '"script":"the spoken line",' : ''}"prompt":"the final prompt, 90-160 words, present tense, concrete, in shot order","negativePrompt":"comma-separated things to avoid"}`,
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
    const script = speaking ? clean(parsed.script, 220).replace(/^["“]|["”]$/g, '') : '';
    let prompt = options.sensitive ? neutralise(clean(parsed.prompt, 1400)) : clean(parsed.prompt, 1400);
    if (!prompt || shots.length === 0 || (speaking && !script)) throw new Error('Storyboard response was incomplete');
    // Veo voices only quoted dialogue that is in the prompt itself.
    if (speaking && !prompt.includes(script)) prompt = `${prompt} Looking into the lens, the person says: "${script}"`;
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
        style,
        script: script || undefined,
        prompt: `${prompt} ${PRODUCT_LOCK_FOR_VIDEO} ${speaking ? speakingSound(script) : SILENT_SOUND}`,
        negativePrompt: speaking
          ? cleanSpeakingNegative(clean(parsed.negativePrompt, 300)) || 'text, captions, subtitles, logos, watermark, warped product, morphing, extra products, distorted face, extra fingers, out-of-sync lips, flicker, low quality'
          : clean(parsed.negativePrompt, 300) || 'text, captions, subtitles, logos, watermark, warped packaging, morphing, extra products, flicker, low quality',
      },
      usage: { inputTokens, outputTokens, totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens, providerModel },
    };
  } catch (error) {
    console.warn('Video storyboard planning failed, using fallback:', error);
    const fallback = fallbackStoryboard(options.context, durationSeconds);
    return { storyboard: options.sensitive ? { ...fallback, prompt: neutralise(fallback.prompt) } : fallback };
  }
}

/** A speaking clip must never tell the video model to avoid people or voices. */
function cleanSpeakingNegative(negative: string): string {
  return negative
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term && !/\b(people|person|persons|human|humans|face|faces|voice|voices|speech|speaking|talking|dialogue|narration|voice-?over)\b/i.test(term))
    .join(', ');
}
