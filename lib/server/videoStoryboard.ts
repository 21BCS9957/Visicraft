import { loadPreparedReferences, requestGeminiText } from '@/lib/banana/api';
import { productBrief, type ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import type { AdDesign } from '@/lib/server/metaAdResearch';
import type { ProviderUsage } from '@/lib/server/usage';
import { isSpeakingStyle, type VideoStyle } from '@/lib/videoStyles';
import { PROMPT_WRITER_MODELS } from '@/lib/server/writerModels';

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
  /** The detailed JSON prompt as sent to Veo (shown to the user, copyable). */
  promptJson?: Record<string, unknown>;
  /** Final prompt for the video model (the compact JSON above, or plain text for the fallback). */
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
  // A worn garment is framed wide enough that its patterns stay at the scale the store photos show.
  const garment = productKind === 'apparel';
  const withProduct = garment ? 'wearing the product, framed from the waist up or wider so the garment reads clearly' : 'holding the product up near their face or chest, its front fully visible to the lens';
  switch (style) {
    case 'ugc':
      return `This image is the first frame of a UGC-style video: an everyday Indian creator filming themselves on a phone${garment ? ' propped up or held at arm\'s length' : ' at arm\'s length'} (front-camera look, slightly wide lens, natural window light, a real lived-in home), ${withProduct}, looking straight into the lens with a friendly, natural expression, lips closed, about to speak. It must look like a real customer's phone video, not an ad shoot.`;
    case 'talking_head':
      return `This image is the first frame of a talking-head video: one presenter (founder, expert or stylist) ${garment ? 'framed from the waist up' : 'framed chest-up'} at eye level on a steady camera, clean real setting, ${withProduct}, looking straight into the lens with a confident, warm expression, lips closed, about to speak.`;
    case 'demo':
      return garment
        ? 'This image is the first frame of a product demo video: a model draping, adjusting or showing the garment, framed from the knees up so its whole pattern, border and blouse read clearly at the scale the product photos show them, clean natural light.'
        : 'This image is the first frame of a product demo video: the product in use, close up, hands about to use it, the product front-facing and unobstructed, clean natural light.';
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
  demo: 'DEMO STYLE: the product being used (hands interacting with it; for a garment, a slow, gentle turn of the body or a hand resting on the pallu so its fall and sheen show, never lifting or re-draping it) in a clear chain of motions within one continuous shot, building to the moment the benefit is visible.',
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
 * Video models redraw a garment's weave whenever it moves or the camera gets closer than
 * the first frame showed it, so fine patterns morph. For clothing the motion stays small.
 */
const GARMENT_MOTION = 'GARMENT FIDELITY IN MOTION: the camera never moves closer than the first frame\'s framing (a locked-off frame or a slow, slight drift); the person\'s movements stay small and natural (speaking, smiling, a slight head tilt, a small hand gesture, a gentle weight shift). No twirling, walking, spinning, lifting or spreading the pallu, touching, stretching or re-draping the fabric: the pattern must stay exactly as in the first frame.';

/** Veo 3.1 reads at most 1,024 prompt tokens; compact JSON of this size stays under it. */
const MAX_VEO_PROMPT_CHARS = 3400;

/** The shape of the detailed JSON prompt Gemini writes for Veo. */
const VEO_JSON_SHAPE = `{"format":{"duration_s":8,"aspect_ratio":"9:16","look":"e.g. iPhone front-camera UGC / cinematic 35mm film","fps":30},"first_frame":"what the supplied first frame shows; the clip starts exactly from it","subject":{"who":"age range, look, hair, expression, exactly as in the first frame","wardrobe":"the product as worn or held, with every pattern detail named","performance":"energy, gestures, micro-expressions"},"scene":{"location":"","set_dressing":"","time_of_day":"","atmosphere":""},"camera":{"rig":"handheld phone / tripod / gimbal / dolly","lens":"focal length equivalent and aperture feel","framing":"","movement":"","focus":""},"lighting":{"key":"","fill":"","practicals":"","colour_temperature":""},"colour_grade":"","timeline":[{"t":"0.0-2.0s","action":"","camera":"","line":"words spoken in this beat, if any"}],"audio":{"dialogue":"Speaker says: “...” (voice, accent, pace) or none","ambience":"","music":"none or the music bed"},"realism":"skin texture, fabric physics (drape, sheen, transparency, weight), natural micro-movements, lens character","avoid":["things to keep out of the clip, as plain nouns"]}`;

type Json = Record<string, unknown>;

/** Straight quotes inside values would be escaped in the JSON Veo reads; typographic ones stay clean. */
function curly(text: string): string {
  let open = true;
  return text.replace(/"/g, () => ((open = !open) ? '”' : '“'));
}

function mapStrings(value: unknown, fn: (text: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  return value;
}

/**
 * Turns Gemini's JSON prompt into the exact prompt Veo receives: our product lock and sound
 * rules are always part of it, "avoid" becomes the negative prompt, and long values are
 * shortened until the whole prompt fits Veo's input limit.
 */
function compileVeoPrompt(
  veo: Json,
  options: { speaking: boolean; script: string; sensitive?: boolean; never?: string[] }
): { json: Json; prompt: string; negative: string } {
  const avoid = Array.isArray(veo.avoid) ? veo.avoid.filter((a): a is string => typeof a === 'string') : [];
  const { avoid: _avoid, product_lock: _lock, sound: _sound, ...rest } = veo;
  void _avoid;
  void _lock;
  void _sound;
  const tidy = (text: string) => {
    const cleaned = curly(text.replace(/\s+/g, ' ').trim());
    return options.sensitive ? neutralise(cleaned) : cleaned;
  };
  // The lock and the sound rules are never shortened; the creative fields give way.
  const fixed = {
    product_lock: tidy(`${PRODUCT_LOCK_FOR_VIDEO}${options.never?.length ? ` Never: ${options.never.join('; ')}.` : ''}`),
    sound: tidy(options.speaking ? speakingSound(options.script) : SILENT_SOUND),
  };
  let body = mapStrings(rest, tidy) as Json;
  const assemble = () => ({ ...body, ...fixed });
  let prompt = JSON.stringify(assemble());
  for (const limit of [420, 320, 240, 180, 130, 90]) {
    if (prompt.length <= MAX_VEO_PROMPT_CHARS) break;
    body = mapStrings(body, (text) => (text.length > limit && !(options.script && text.includes(options.script)) ? `${text.slice(0, limit - 1).trimEnd()}…` : text)) as Json;
    prompt = JSON.stringify(assemble());
  }
  const negative = avoid.map((a) => a.trim()).filter(Boolean).join(', ');
  return { json: assemble(), prompt, negative };
}

function parseJson(raw: string): Json {
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Json;
}

function responseText(response: Awaited<ReturnType<typeof requestGeminiText>>['response']): string {
  return response.data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter((t): t is string => typeof t === 'string').join('') ?? '';
}

function usageOf(response: Awaited<ReturnType<typeof requestGeminiText>>['response'], providerModel: string): ProviderUsage {
  const meta = response.data.usageMetadata;
  const inputTokens = Number(meta?.promptTokenCount) || 0;
  const outputTokens = Number(meta?.candidatesTokenCount) || 0;
  return { inputTokens, outputTokens, totalTokens: Number(meta?.totalTokenCount) || inputTokens + outputTokens, providerModel };
}

/** The storyboard beats shown in the UI, read from the JSON prompt's timeline. */
function shotsFrom(veo: Json): StoryboardShot[] {
  return (Array.isArray(veo.timeline) ? veo.timeline : [])
    .map((beat) => {
      const b = (beat && typeof beat === 'object' ? beat : {}) as Json;
      const action = clean(b.action, 220);
      const line = clean(b.line, 160);
      return action ? { t: clean(b.t, 14) || '?', action: line && !/^none$/i.test(line) ? `${action} — “${line.replace(/^["“]|["”]$/g, '')}”` : action, camera: clean(b.camera, 80), purpose: '' } : null;
    })
    .filter((shot): shot is StoryboardShot => shot !== null)
    .slice(0, 8);
}

function speakingNegative(negative: string): string {
  return cleanSpeakingNegative(negative) || 'text, captions, subtitles, logos, watermark, warped product, morphing, extra products, distorted face, extra fingers, out-of-sync lips, flicker, low quality';
}

/**
 * Writes the video ad for our product as a detailed JSON prompt for Veo, modelled on the
 * longest-running video ads in the niche (their watched shot sequence) in the chosen style.
 * It runs while the hero frame renders; groundVideoStoryboard() then matches it to the
 * frame. Falls back to a safe generic storyboard so video generation never blocks on it.
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
  /** Garments: the exact pattern spec (compact JSON) and the wrong versions to avoid. */
  productSpec?: string;
  never?: string[];
}): Promise<{ storyboard: VideoStoryboard; usage?: ProviderUsage }> {
  const durationSeconds = options.durationSeconds ?? 8;
  const designs = (options.winningDesigns ?? []).filter((d) => d.sequence?.length).slice(0, 3);
  const style = resolveVideoStyle(options.style, options.winningDesigns, options.sensitive);
  const speaking = isSpeakingStyle(style);
  const maxWords = Math.max(10, Math.round(durationSeconds * 2.2));
  const frame = heroFrameDirection(style, options.productKind);
  const designBlock = designs.length
    ? `\nWINNING VIDEO ADS IN THIS NICHE (watched in full; longest-running first; model the STRUCTURE, PACING and CAMERA LANGUAGE of #1, never the brand, wording or claims):\n${designs
        .map((d, i) => `#${i + 1} (${d.daysRunning} days live) format: ${d.format}; hook: ${d.hook}; audio: ${d.audio || 'n/a'}; sequence: ${(d.sequence ?? []).map((b) => `[${b.t}] ${b.shot}${b.camera ? ` (${b.camera})` : ''}${b.purpose ? ` → ${b.purpose}` : ''}`).join(' | ')}`)
        .join('\n')}\n`
    : '';

  try {
    const { response, providerModel } = await requestGeminiText(
      [{
        text: `You are the creative director and director of photography of a top Indian D2C video studio. Write a ${durationSeconds}-second, vertical 9:16 Meta Reels ad for this product as ONE detailed JSON prompt for Google Veo 3.1 (image-to-video with native audio). Your goal is the most realistic, scroll-stopping, revenue-driving clip possible.

${STYLE_DIRECTION[style]}

${productBrief(options.context)}
Product identity notes: ${clean(options.identityManifest, 1200) || 'n/a'}
${options.productSpec ? `Exact garment spec (subject.wardrobe must name these patterns precisely, as they appear in the product photos):\n${options.productSpec.slice(0, 3000)}\n` : ''}${frame ? `The first frame (already being rendered) is staged like this: ${frame}\n` : ''}${options.userDirection ? `Client direction: ${clean(options.userDirection, 600)}\n` : ''}${options.adPatterns ? `\nWHAT THE LONGEST-RUNNING ADS IN THIS NICHE DO:\n${clean(options.adPatterns, 1800)}\n` : ''}${designBlock}
How to write it:
- Fill every field of the JSON shape below with concrete, filmable values, as a DoP would on a call sheet: real lens and rig choices, light directions and colour temperatures, exact actions and gestures. No vague adjectives ("beautiful", "stunning", "high quality").
- "timeline": ${Math.max(3, Math.min(5, Math.round(durationSeconds / 2)))} beats covering 0-${durationSeconds}s. The clip starts from the supplied first frame, so beat 1 begins from that exact pose and framing. One continuous take: smooth camera moves and natural motion, no hard cuts, no new locations, no outfit or lighting changes.
- The product stays identical and clearly visible throughout${options.productKind === 'apparel' ? ' as worn in the first frame; name its fabric, colours and pattern motifs exactly in subject.wardrobe, and describe its sheen and how light plays on it in realism' : ', front-facing and unobstructed'}. No on-screen text, captions, subtitles or logos.${options.productKind === 'apparel' ? `\n- ${GARMENT_MOTION}` : ''}
- Photoreal and Indian where people or places appear; only claims the product context supports.
${speaking ? `- The person speaks ONE line (the "script"): at most ${maxWords} words so it fits ${durationSeconds} seconds at a natural pace; its first words are the hook; ${style === 'ugc' ? 'first person, like a real customer talking to a friend' : 'the presenter\'s confident voice, speaking to the viewer'}; one concrete benefit; no prices, discounts or competitor names; never mention a city, store, market, visit or event unless the product context names it (the brand sells online). Language: the winning ad's spoken language when it is English or Hinglish (Hinglish in Latin script), otherwise natural Indian English. Put it verbatim in audio.dialogue as Speaker says: “...” and split it across the timeline beats' "line" fields. Lips move in sync; only their voice with light room tone, no music.
- "avoid" must never list people, faces, speech or voices.` : `- The first 1.5 seconds must stop the scroll (motion, reveal, contrast); the end holds calmly on the product.
- Audio: natural ambience and a soft music bed; audio.dialogue is "none" (no voice-over, no lyrics).`}
- Every beat either stops the scroll, makes the promise visible or builds desire for the product; nothing decorative.${options.sensitive ? `
- CONTENT POLICY (strict): no person appears at any point. Motion comes only from the camera and the light. Refer to the product only as "the garment" or "the set"; never use words such as lingerie, underwear, sexy, sensual, seductive, intimate, bedroom, boudoir, body or skin.` : ''}
- Keep the whole JSON under 2,600 characters: dense, specific phrases rather than long sentences.

Return JSON only: {"hook":"one sentence for the client","mood":"","modelledOn":1,${speaking ? '"script":"the spoken line",' : ''}"veo":${VEO_JSON_SHAPE}}`,
      }],
      { temperature: 0.5, responseMimeType: 'application/json' },
      'Video storyboard planning',
      PROMPT_WRITER_MODELS,
      90000
    );
    const parsed = parseJson(responseText(response));
    const veo = parsed.veo && typeof parsed.veo === 'object' && !Array.isArray(parsed.veo) ? parsed.veo as Json : null;
    const script = speaking ? clean(parsed.script, 220).replace(/^["“]|["”]$/g, '') : '';
    if (!veo || (speaking && !script)) throw new Error('Storyboard response was incomplete');
    if (speaking) {
      // Veo voices only dialogue written into the prompt itself.
      const audio = (veo.audio && typeof veo.audio === 'object' ? veo.audio : {}) as Json;
      if (!clean(audio.dialogue, 400).includes(script.slice(0, 20))) veo.audio = { ...audio, dialogue: `The person says: “${script}”` };
    }
    const compiled = compileVeoPrompt(veo, { speaking, script, sensitive: options.sensitive, never: options.never });
    const shots = shotsFrom(compiled.json);
    if (shots.length === 0) throw new Error('Storyboard response had no timeline');
    const modelledIndex = Number(parsed.modelledOn);
    const modelled = designs[(Number.isInteger(modelledIndex) && modelledIndex >= 1 ? modelledIndex - 1 : 0)];
    return {
      storyboard: {
        hook: clean(parsed.hook, 200),
        shots,
        mood: clean(parsed.mood, 120),
        modelledOn: modelled?.pageName,
        style,
        script: script || undefined,
        promptJson: compiled.json,
        prompt: compiled.prompt,
        negativePrompt: speaking
          ? speakingNegative(compiled.negative)
          : compiled.negative || 'text, captions, subtitles, logos, watermark, warped packaging, morphing, extra products, flicker, low quality',
      },
      usage: usageOf(response, providerModel),
    };
  } catch (error) {
    console.warn('Video storyboard planning failed, using fallback:', error);
    const fallback = fallbackStoryboard(options.context, durationSeconds);
    return { storyboard: options.sensitive ? { ...fallback, prompt: neutralise(fallback.prompt) } : fallback };
  }
}

/**
 * Matches the JSON prompt to the hero frame that was actually rendered: Veo animates that
 * frame, so every visible detail in the prompt (person, wardrobe, setting, light, framing)
 * must describe it exactly, or the clip drifts and morphs away from it.
 */
export async function groundVideoStoryboard(
  storyboard: VideoStoryboard,
  options: { heroUrl: string; productSpec?: string; never?: string[]; sensitive?: boolean; garment?: boolean }
): Promise<{ storyboard: VideoStoryboard; usage?: ProviderUsage } | null> {
  if (!storyboard.promptJson) return null;
  const { images } = await loadPreparedReferences([options.heroUrl]);
  if (images.length === 0) return null;
  const speaking = isSpeakingStyle(storyboard.style);
  const { product_lock: _lock, sound: _sound, ...draft } = storyboard.promptJson;
  void _lock;
  void _sound;
  const { response, providerModel } = await requestGeminiText(
    [
      {
        text: `You are the director of photography who wrote this JSON prompt for Google Veo 3.1. The image is the exact first frame Veo will animate (already rendered with the real product). Update the JSON so it matches this frame exactly:
- "first_frame", "subject.who" (the same person: age, face, hair, expression), "subject.wardrobe" (exactly as worn here${options.productSpec ? ', using the garment spec\'s pattern names' : ''}), "scene", "camera.framing" and lens feel, "lighting" and "colour_grade" as they are in the frame.
- Timeline beat 1 starts from this exact pose and framing; every later beat must be physically possible from it (no outfit, location or lighting changes; only smooth camera moves and natural motion).${options.garment ? `\n- ${GARMENT_MOTION} Rewrite any beat or camera move that breaks this.` : ''}
- Keep the style, the beats' intent${speaking ? ', the spoken line word for word' : ''} and the audio plan. Keep it under 2,600 characters.
${options.productSpec ? `\nGarment spec:\n${options.productSpec.slice(0, 2500)}\n` : ''}
Return JSON only: {"veo":{...the full updated JSON, same shape, including "avoid"...}}

Current JSON:
${JSON.stringify({ ...draft, avoid: storyboard.negativePrompt.split(',').map((a) => a.trim()).filter(Boolean) })}`,
      },
      { text: 'FIRST FRAME:' },
      { inlineData: { mimeType: images[0].mimeType, data: images[0].data } },
    ],
    { temperature: 0.3, responseMimeType: 'application/json' },
    'Video prompt grounding',
    PROMPT_WRITER_MODELS,
    60000
  );
  const parsed = parseJson(responseText(response));
  const veo = parsed.veo && typeof parsed.veo === 'object' && !Array.isArray(parsed.veo) ? parsed.veo as Json : null;
  if (!veo) return null;
  const script = storyboard.script ?? '';
  if (speaking && script) {
    const audio = (veo.audio && typeof veo.audio === 'object' ? veo.audio : {}) as Json;
    if (!clean(audio.dialogue, 400).includes(script.slice(0, 20))) veo.audio = { ...audio, dialogue: `The person says: “${script}”` };
  }
  const compiled = compileVeoPrompt(veo, { speaking, script, sensitive: options.sensitive, never: options.never });
  const shots = shotsFrom(compiled.json);
  return {
    storyboard: {
      ...storyboard,
      shots: shots.length ? shots : storyboard.shots,
      promptJson: compiled.json,
      prompt: compiled.prompt,
      negativePrompt: compiled.negative ? (speaking ? speakingNegative(compiled.negative) : compiled.negative) : storyboard.negativePrompt,
    },
    usage: usageOf(response, providerModel),
  };
}

/** A speaking clip must never tell the video model to avoid people or voices. */
function cleanSpeakingNegative(negative: string): string {
  return negative
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term && !/\b(people|person|persons|human|humans|face|faces|voice|voices|speech|speaking|talking|dialogue|narration|voice-?over)\b/i.test(term))
    .join(', ');
}
