import { CLAUDE_VIDEO_MODEL_NAME, jsonSchema as js, requestClaudeJson } from '@/lib/server/claude';
import { winnerSequences, writtenByLine, type VideoWriter } from '@/lib/server/videoWriter';
import { productBrief, type ShopifyProductContext } from '@/lib/prompts/shopifyCreative';
import type { AdDesign } from '@/lib/server/metaAdResearch';
import type { ReferenceImage } from '@/lib/server/referenceImages';
import type { ProviderUsage } from '@/lib/server/usage';
import { neutralise, resolveVideoStyle, type VideoStoryboard } from '@/lib/server/videoStoryboard';
import { isSpeakingStyle, type VideoStyle } from '@/lib/videoStyles';

/**
 * A Seedance 2.x product film built from reference images, written the way the Neeksha film
 * was: a look line, the product described exactly as its photos show it, one setting, timed
 * shots with one camera move each, sound in Seedance's own markup and a constraints line.
 * Claude Opus 5.5 writes the shot list as JSON after seeing the references and the winning
 * videos' sequences; the prompt text itself is compiled here, so its structure never drifts.
 */

export interface SeedanceFilm {
  hook: string;
  look: string;
  product: string;
  setting: string;
  /** Who appears: nobody (a product film), only hands, or one presenter. */
  people: 'none' | 'hands' | 'presenter';
  presenter: string;
  /** "image" is the product reference a shot builds on (1-based, 0 for none). */
  shots: Array<{ t: string; framing: string; image: number; action: string; camera: string }>;
  music: string;
  sfx: string[];
  dialogue: string;
  avoid: string[];
  modelledOn?: string;
}

type Json = Record<string, unknown>;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Long text cut at the last full sentence that fits, never mid-word. */
function sentences(value: unknown, max: number): string {
  const text = clean(value, 100_000);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = cut.lastIndexOf('. ');
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

function list(value: unknown, max: number, items: number): string[] {
  return Array.isArray(value) ? value.map((v) => clean(v, max)).filter(Boolean).slice(0, items) : [];
}

function shotCount(seconds: number): number {
  return seconds <= 8 ? 3 : seconds <= 15 ? 4 : 5;
}

/** Evenly timed shots when the writer's timing is missing. */
function evenTimes(count: number, seconds: number): string[] {
  const step = seconds / count;
  return Array.from({ length: count }, (_, i) => `${Math.round(i * step)}-${Math.round((i + 1) * step)}s`);
}

function styleDirection(style: string, garment: boolean, sensitive: boolean): string {
  if (garment || sensitive) {
    return 'A premium product film: the product is the only subject, no person at any point. Motion comes from slow camera moves, light travelling across it and at most a soft breeze on light fabric.';
  }
  switch (style) {
    case 'ugc':
      return "A real customer's phone video: ONE adult presenter (describe them in \"presenter\") films themselves at home at arm's length, talks to the camera like a friend and shows the product up close. Handheld, natural daylight.";
    case 'talking_head':
      return 'A talking-head ad: ONE adult presenter (describe them in "presenter") speaks straight into the lens in a clean real setting, the product clearly visible in their hands or beside them. Steady camera.';
    case 'demo':
      return "A hands-on demo: only an adult's hands appear (never a face), using the product in a clear chain of actions that makes its benefit visible, filmed up close.";
    default:
      return 'A premium product film: the product is the only subject, no person at any point. Macro details, light moving across it, a reveal, and a calm hero shot at the end.';
  }
}

function fallbackFilm(context: ShopifyProductContext | undefined, seconds: number): SeedanceFilm {
  const times = evenTimes(4, seconds);
  const name = context?.title || 'the product';
  return {
    hook: 'A slow, luminous reveal of the product',
    look: 'luxury product film. Photoreal, cinematic 35mm look, soft natural daylight, shallow depth of field, rich but true colours, fine film grain',
    product: `${name}, exactly as the reference images show it`,
    setting: 'a calm, softly lit studio corner with warm neutral walls and a sunlit floor; daylight from a tall window on the left',
    people: 'none',
    presenter: '',
    shots: [
      { t: times[0], framing: 'Extreme close-up', image: 1, action: 'A warm glint of sunlight sweeps slowly across the product’s finest detail', camera: 'Slow lateral slide' },
      { t: times[1], framing: 'Close-up', image: 1, action: 'The light moves across its surface, revealing texture and colour', camera: 'Slow downward tracking shot' },
      { t: times[2], framing: 'Medium shot', image: 1, action: 'The whole product comes into view, standing still in the light', camera: 'Slow push-in' },
      { t: times[3], framing: 'Wide shot', image: 1, action: 'The product rests in the sunlit setting, perfectly still. Hold on this final frame', camera: 'Slow pull-back' },
    ],
    music: 'a slow, elegant instrumental melody, calm and premium',
    sfx: ['soft room ambience'],
    dialogue: '',
    avoid: [],
  };
}

const FILM_SCHEMA = js.obj({
  hook: js.str,
  look: js.str,
  product: js.str,
  setting: js.str,
  people: js.oneOf(['none', 'hands', 'presenter']),
  presenter: js.str,
  shots: js.list(js.obj({ t: js.str, framing: js.str, image: js.int, action: js.str, camera: js.str })),
  music: js.str,
  sfx: js.strList,
  dialogue: js.str,
  avoid: js.strList,
  modelledOn: js.int,
});

const FILM_SYSTEM = 'You are the creative director and director of photography of a top Indian D2C video studio. You write product video ads for ByteDance Seedance 2.5 as a structured shot list; Visicraft turns it into the exact prompt Seedance receives and shows it to the brand for approval before anything renders. You model the structure, pacing and camera language of the winning video ads you are given (their timed beats were watched in full by an analyst), but never copy a competitor\'s brand, wording or claims.';

/**
 * Claude Opus 5.5 writes the shot list after looking at the product's reference images and
 * the winning videos' timed sequences. A template film is used, and said so, if Claude fails.
 */
export async function writeSeedanceFilm(options: {
  context?: ShopifyProductContext;
  identityManifest?: string;
  userDirection?: string;
  adPatterns?: string;
  winningDesigns?: AdDesign[];
  durationSeconds: number;
  style?: VideoStyle;
  productKind?: 'packaged' | 'apparel' | 'object';
  productSpec?: string;
  never?: string[];
  sensitive?: boolean;
  /** The project's guidelines (Markdown), when the video is made in a project. */
  guidelines?: string;
  /** The reference shows the product on a display mannequin (the store photo's model replaced). */
  onMannequin?: boolean;
  /** The product references, in the order they are sent (Image 1..N). */
  references: ReferenceImage[];
}): Promise<{ film: SeedanceFilm; style: Exclude<VideoStyle, 'any'>; usage?: ProviderUsage; writer: VideoWriter }> {
  const seconds = options.durationSeconds;
  const garment = options.productKind === 'apparel';
  const style = resolveVideoStyle(options.style, options.winningDesigns, options.sensitive);
  const speaking = isSpeakingStyle(style) && !garment && !options.sensitive;
  const count = shotCount(seconds);
  const maxWords = Math.max(10, Math.round(seconds * 2.2));
  const designs = (options.winningDesigns ?? []).filter((d) => d.sequence?.length).slice(0, 3);
  const references = options.references.slice(0, 6);
  const guidelines = options.guidelines?.trim();

  const prompt = `Write a ${seconds}-second vertical 9:16 Meta Reels ad for this product, to be generated by ByteDance Seedance 2.5 from the product's reference images above (reference-to-video: it builds every shot from these images and your words, there is no first frame). Goal: the most realistic, premium, scroll-stopping clip possible, with the product exactly as in its photos.

${styleDirection(style, garment, Boolean(options.sensitive))}${options.onMannequin ? '\nThe reference image shows the product on a faceless ivory display mannequin (it replaced the model in the store photo). Keep the product on that mannequin in every shot: the mannequin stays perfectly still and is never removed, and no person appears.' : ''}${options.sensitive ? '\nWording (strict): never use words such as lingerie, underwear, sexy, sensual, seductive, intimate, bedroom, boudoir, body or skin; call the product "the set" or "the garment".' : ''}

${productBrief(options.context)}
Product identity notes: ${clean(options.identityManifest, 1200) || 'n/a'}
${options.productSpec ? `Exact product spec (name these details precisely in "product"):\n${options.productSpec.slice(0, 2500)}\n` : ''}${options.never?.length ? `Never show: ${options.never.join('; ')}\n` : ''}${options.userDirection ? `Client direction: ${clean(options.userDirection, 1500)}\n` : ''}${guidelines ? 'Follow the project guidelines above: brand, product facts, tone and every do/don\'t. When they and the client direction disagree, the client direction wins for this video.\n' : ''}${options.adPatterns ? `\nWHAT THE LONGEST-RUNNING ADS IN THIS NICHE DO:\n${clean(options.adPatterns, 2000)}\n` : ''}${designs.length ? `\nWINNING VIDEO ADS IN THIS NICHE, WATCHED IN FULL (longest-running first). Turn the sequence of #1 into our shot list: keep its timing, shot sizes, camera moves and the order of its beats (hook, reveal, proof, call to action), with our product and our setting:\n${winnerSequences(designs)}\n` : '\nNo winning videos were studied for this one; write the strongest film for the product and style.\n'}
Reference images (attached above, in this order):
${references.map((r, i) => `Image ${i + 1}: ${r.label}`).join('\n')}

How to write it (Seedance's own prompt rules):
- "product": exactly what the reference images show, in at most 90 words: colours, materials, finish, shape, patterns, and any printed text or logo word for word as it appears. Never invent details, text or features.
- "shots": exactly ${count} shots whose "t" values cover 0-${seconds}s end to end, written like "0-3s". Each has a framing (extreme close-up, close-up, medium or wide), the reference image it builds on ("image", 1-${references.length}), a concrete physical action with its speed and size (e.g. "a warm glint of sunlight sweeps slowly across the zari border", "the pallu lifts a few centimetres and settles"), and exactly ONE camera movement (slow push-in, slow lateral slide, slow downward tracking shot, slow orbit, slow pull-back or fixed camera). Prefer slow, gentle, continuous motion; no fast or large movements.
- Shot 1 must stop the scroll within 1.5 seconds (a macro glint, a reveal, a satisfying motion). The last shot is a calm hero shot of the whole product, held still.
- "setting": ONE location suited to the product and its price tier (Indian where it fits), with its light direction and quality. All shots happen there.
- "look": one line of image quality and style, e.g. "luxury product film. Photoreal, cinematic 35mm look, soft natural daylight, shallow depth of field, rich but true colours, fine film grain".
- Sound: "music" (instruments, tempo, mood) and 1-3 "sfx" (quiet, specific sounds).${speaking ? ` "dialogue": ONE spoken line in natural Indian English, at most ${maxWords} words, its first words are the hook, one concrete benefit, no prices or competitor names; "presenter": age range, look and clothing of the one adult presenter.` : ' "dialogue" is "" (no voice).'}
- "people": ${speaking ? '"presenter"' : style === 'demo' && !garment && !options.sensitive ? '"hands"' : '"none"'}.
- "avoid": 4-8 specific wrong versions to keep out (e.g. "extra products", "the logo misspelled", "the car turned blue").${speaking ? ' Never list people, faces or voices.' : ''}
- "hook": one sentence for the brand describing the idea. "modelledOn": the number of the winning ad you modelled, or 0.`;

  try {
    const { json: parsed, usage } = await requestClaudeJson<Json>({
      system: FILM_SYSTEM,
      context: guidelines ? [`PROJECT GUIDELINES (Markdown):\n\n${guidelines.slice(0, 50_000)}`] : [],
      images: references.map((r, i) => ({ label: `Image ${i + 1} (${r.label || 'product'}):`, url: r.url })),
      prompt,
      schema: FILM_SCHEMA,
      timeoutMs: 150_000,
    });
    const times = evenTimes(count, seconds);
    const shots = (Array.isArray(parsed.shots) ? parsed.shots : [])
      .map((shotValue, i) => {
        const shot = (shotValue && typeof shotValue === 'object' ? shotValue : {}) as Json;
        const image = Number(shot.image);
        return {
          t: /^\d+(\.\d+)?-\d+(\.\d+)?s$/.test(clean(shot.t, 12)) ? clean(shot.t, 12) : times[i] ?? `${seconds}s`,
          framing: clean(shot.framing, 40) || 'Close-up',
          image: Number.isInteger(image) && image >= 1 && image <= references.length ? image : 0,
          action: clean(shot.action, 320),
          camera: clean(shot.camera, 60) || 'Slow push-in',
        };
      })
      .filter((shot) => shot.action)
      .slice(0, count + 1);
    if (shots.length < 2 || !clean(parsed.product, 10)) throw new Error('The film plan was incomplete');
    const people = parsed.people === 'presenter' && speaking ? 'presenter' : parsed.people === 'hands' && !garment && !options.sensitive ? 'hands' : 'none';
    const modelled = Number(parsed.modelledOn) > 0 ? designs[Math.max(0, Number(parsed.modelledOn) - 1)] : undefined;
    return {
      film: {
        hook: clean(parsed.hook, 200),
        look: clean(parsed.look, 260) || fallbackFilm(options.context, seconds).look,
        product: sentences(parsed.product, 1100),
        setting: clean(parsed.setting, 400),
        people,
        presenter: people === 'presenter' ? clean(parsed.presenter, 200) : '',
        shots,
        music: clean(parsed.music, 200),
        sfx: list(parsed.sfx, 80, 3),
        dialogue: people === 'presenter' ? clean(parsed.dialogue, 240).replace(/^["“{]|["”}]$/g, '') : '',
        avoid: list(parsed.avoid, 80, 8),
        modelledOn: modelled?.pageName,
      },
      style,
      usage,
      writer: { writtenBy: writtenByLine(designs, modelled?.pageName) },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Claude failed';
    console.warn('Seedance film writing (Claude) failed, using the template film:', reason);
    return {
      film: fallbackFilm(options.context, seconds),
      style,
      writer: { writtenBy: 'A basic template', fallbackReason: `${CLAUDE_VIDEO_MODEL_NAME} could not write this prompt (${reason}), so this is a basic template. Edit it, or cancel and try again.` },
    };
  }
}

/**
 * The exact prompt Seedance receives. `opening` puts a person-free hero frame first (Image 1,
 * the scene the film opens on) and shifts the product references to Image 2 onwards. Image
 * numbers appear only as "(Image k)" and "Opening scene: Image 1." so the review screen can
 * drop a reference and renumber the rest.
 */
/** Sentence case at the joins of the compiled prompt. */
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** The style line reads on from "10-second vertical"; acronyms (UGC, 4K) are left alone. */
const lowerLook = (text: string) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);
/** A leading article after a colon ("…: a sheer saree"); names and brands keep their capitals. */
const lowerArticle = (text: string) => text.replace(/^(A|An|The)\b/, (word) => word.toLowerCase());
const trimEnd = (text: string) => text.replace(/[.\s]+$/, '');

export function compileSeedanceFilm(film: SeedanceFilm, options: {
  durationSeconds: number;
  opening: boolean;
  family: '2.0' | '2.5';
  audio: boolean;
  /** The references show the product on a display mannequin, which must stay in the film. */
  mannequin?: boolean;
  /** Intimate wear and similar: words that trip the video model's filter are replaced. */
  sensitive?: boolean;
}): string {
  const offset = options.opening ? 1 : 0;
  const peopleLine = film.people === 'none'
    ? options.mannequin
      ? 'The product is the only subject, displayed on a faceless ivory display mannequin that never moves: no people, no faces, no hands.'
      : 'The product is the only subject: no people, no hands, no mannequin.'
    : film.people === 'hands'
      ? "Only an adult's hands appear, never a face."
      : `One presenter: ${film.presenter || 'an adult presenter'}.`;
  const shots = film.shots.map((shot, i) => {
    const ref = shot.image > 0 ? ` (Image ${shot.image + offset})` : '';
    const action = shot.action.replace(/[.\s]+$/, '');
    return `Shot ${i + 1} (${shot.t}): ${upperFirst(trimEnd(shot.framing))}. ${upperFirst(action)}${ref}. ${upperFirst(trimEnd(shot.camera))}.`;
  });
  const sound = !options.audio
    ? ''
    : options.family === '2.5'
      ? `Sound: ${film.music ? `(${film.music})` : ''}${film.sfx.map((s) => ` <${s}>`).join('')}. ${film.dialogue ? `The presenter says, in English: {${film.dialogue}}` : 'No voice, no dialogue, no singing.'}`
      : `Sound: ${[film.music && `music: ${film.music}`, film.sfx.length && `effects: ${film.sfx.join(', ')}`].filter(Boolean).join('; ')}. ${film.dialogue ? `The presenter says: "${film.dialogue}"` : 'No voice, no dialogue, no singing.'}`;
  const who = film.people === 'none' ? (options.mannequin ? 'No people, faces or hands; the mannequin stays still. ' : 'No people, faces or hands. ') : film.people === 'hands' ? 'No faces. ' : 'Only the one presenter appears. ';
  const avoid = film.avoid.length ? ` Avoid: ${film.avoid.join(', ')}.` : '';
  const text = [
    `${options.durationSeconds}-second vertical ${lowerLook(trimEnd(film.look))}. ${peopleLine}`,
    '',
    `The product is exactly the one in the reference images: ${lowerArticle(trimEnd(film.product))}. Keep its colours, materials, shape, pattern and any printed text exactly as in the reference images in every shot.`,
    '',
    ...(options.opening ? ['Opening scene: Image 1.', ''] : []),
    `Setting: ${lowerArticle(trimEnd(film.setting))}.`,
    '',
    ...shots,
    '',
    ...(sound ? [sound, ''] : []),
    `Constraints: keep it subtitle-free and avoid generating any text or subtitles; do not add any logo or watermark that is not on the product itself. ${who}Do not change the product's colours, shape, pattern or printed text; no morphing, warping or melting; no flicker; one location only.${avoid}`,
  ].join('\n').replace(/\n{3,}/g, '\n\n');
  return (options.sensitive ? neutralise(text) : text).slice(0, 6000);
}

/** The film as a storyboard for the pipeline view (hook, beats, the JSON behind the prompt). */
export function filmStoryboard(film: SeedanceFilm, prompt: string, style: Exclude<VideoStyle, 'any'>): VideoStoryboard {
  return {
    hook: film.hook || film.shots[0]?.action || 'Product film',
    shots: film.shots.map((s) => ({ t: s.t, action: s.action, camera: s.camera, purpose: s.framing })),
    mood: film.look,
    modelledOn: film.modelledOn,
    style,
    script: film.dialogue || undefined,
    promptJson: film as unknown as Record<string, unknown>,
    prompt,
    negativePrompt: '',
  };
}
