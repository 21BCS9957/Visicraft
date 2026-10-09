import { getCreditCost } from '@/lib/credits/calculator';
import { SEEDANCE_MODELS, seedanceSpec, videoAspectInfo, videoEngineOf, type VideoAspect, type VideoQuality } from '@/lib/videoModels';

/**
 * Video Studio types and pure helpers, shared by the browser and the history API. A video is
 * one usage row (a review waiting for approval, then its render) plus any upgrades made from it.
 */

/** Seedance 2.5 renders from the product photos and Claude's prompt; the default for new projects. */
export const DEFAULT_VIDEO_MODEL = 'dreamina-seedance-2-5-260628';

/** The video models the app renders with, Seedance 2.5 first. The Veo id only marks the family; the server picks the best Veo. */
export const VIDEO_MODELS: Array<{ id: string; name: string; blurb: string }> = [
  ...SEEDANCE_MODELS.filter((spec) => spec.id === DEFAULT_VIDEO_MODEL).map((spec) => ({
    id: spec.id,
    name: spec.name,
    blurb: `${spec.minSeconds}–${spec.maxSeconds} s · sound · builds the film from your product photos · no real faces`,
  })),
  { id: 'veo-3.1-generate-001', name: 'Google Veo', blurb: 'Veo 3.1 or the newest your key allows · 4–8 s · sound · real models welcome' },
  ...SEEDANCE_MODELS.filter((spec) => spec.id !== DEFAULT_VIDEO_MODEL).map((spec) => ({
    id: spec.id,
    name: spec.name,
    blurb: [
      `${spec.minSeconds}–${spec.maxSeconds} s`,
      spec.audio ? 'sound' : 'silent',
      spec.realFaces ? 'real models welcome' : 'no real faces',
    ].join(' · '),
  })),
];

/** Credits for rewriting a video prompt from a short instruction on the approval screen. */
export const PROMPT_REWRITE_CREDITS = 3;

/** The hero frame of a video ad is one 2K Nano Banana Pro image, charged when planning. */
export const HERO_FRAME_CREDITS = getCreditCost('nano-banana-pro', '2K');

export function videoModelName(model: string): string {
  if (videoEngineOf(model) === 'seedance') return seedanceSpec(model).name;
  return /fast/.test(model) ? 'Veo Fast' : 'Veo';
}

/** What the server says it rendered with. */
export interface VideoInfo {
  model: string;
  quality: VideoQuality;
  durationSeconds: number;
  aspectRatio: VideoAspect;
  /** A Seedance 2.5 draft: upgrading keeps this exact take. */
  nativeDraft: boolean;
}

export function readVideoInfo(raw: unknown): VideoInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.model !== 'string' || typeof v.quality !== 'string') return null;
  return {
    model: v.model,
    quality: v.quality as VideoQuality,
    durationSeconds: typeof v.durationSeconds === 'number' ? v.durationSeconds : 8,
    aspectRatio: readAspect(v.aspectRatio),
    nativeDraft: v.nativeDraft === true,
  };
}

/** A video's shape as stored (older videos have none: they are 9:16). */
export function readAspect(raw: unknown): VideoAspect {
  return videoAspectInfo(typeof raw === 'string' ? raw : undefined).id;
}

/** What a review image is: the user's photo, a close-up cut from one, a scene image, the hero frame or the mannequin edit. */
export type ReviewFrameKind = 'photo' | 'crop' | 'scene' | 'frame' | 'mannequin';

/** The plan in plain words (cast, setting, shots, spoken line), saved with the review. */
export interface ReviewOutline {
  hook?: string;
  cast?: string;
  setting?: string;
  shots: Array<{ t: string; action: string; camera?: string }>;
  script?: string;
}

/** Where a close-up was cut from: the original photo and the area, [x, y, width, height] as shares of it. */
export interface FrameSource {
  url: string;
  box: [number, number, number, number];
}

function readSource(raw: unknown): FrameSource | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const box = Array.isArray(s.box) ? s.box.map(Number) : [];
  if (typeof s.url !== 'string' || box.length !== 4 || !box.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) return undefined;
  return { url: s.url, box: box as FrameSource['box'] };
}

/** A video the pipeline prepared, waiting for the user's approval before it renders. */
export interface VideoReviewState {
  id: string;
  model: string;
  quality: VideoQuality;
  durationSeconds: number;
  /** The shape it was planned in; the frames and prompt are made for it. */
  aspectRatio: VideoAspect;
  /** first_frame: the clip starts from the frame. reference: the film is built from all images (Image 1..N). */
  mode: 'first_frame' | 'reference';
  frames: Array<{ url: string; label: string; kind?: ReviewFrameKind; source?: FrameSource }>;
  prompt: string;
  negativePrompt?: string;
  credits: number;
  notes: string[];
  /** The product is a garment ("the outfit"). */
  garment?: boolean;
  /** How the prompt was written ("Written from the shots of your reference video"). */
  writtenBy?: string;
  /** The reference videos the shots were copied from; never sent to the video model. */
  referenceVideos: Array<{ id: string; name: string; posterUrl: string | null; url?: string; shots?: number }>;
  outline: ReviewOutline | null;
}

const FRAME_KINDS: ReviewFrameKind[] = ['photo', 'crop', 'scene', 'frame', 'mannequin'];

function readOutline(raw: unknown): ReviewOutline | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  const shots = Array.isArray(o.shots)
    ? (o.shots as Array<Record<string, unknown>>)
      .filter((shot) => typeof shot?.action === 'string')
      .map((shot) => ({ t: text(shot.t) ?? '', action: shot.action as string, camera: text(shot.camera) }))
    : [];
  return { hook: text(o.hook), cast: text(o.cast), setting: text(o.setting), shots, script: text(o.script) };
}

export function readVideoReview(id: unknown, raw: unknown): VideoReviewState | null {
  if ((typeof id !== 'string' && typeof id !== 'number') || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.prompt !== 'string' || typeof r.model !== 'string' || !Array.isArray(r.frames)) return null;
  return {
    id: String(id),
    model: r.model,
    quality: (typeof r.quality === 'string' ? r.quality : '1080p') as VideoQuality,
    durationSeconds: typeof r.durationSeconds === 'number' ? r.durationSeconds : 8,
    aspectRatio: readAspect(r.aspectRatio),
    mode: r.mode === 'reference' ? 'reference' : 'first_frame',
    frames: (r.frames as Array<Record<string, unknown>>)
      .filter((f) => typeof f?.url === 'string')
      .map((f) => ({
        url: f.url as string,
        label: typeof f.label === 'string' ? f.label : '',
        kind: FRAME_KINDS.find((kind) => kind === f.kind),
        source: readSource(f.source),
      })),
    prompt: r.prompt,
    negativePrompt: typeof r.negativePrompt === 'string' ? r.negativePrompt : undefined,
    credits: typeof r.credits === 'number' ? r.credits : 0,
    notes: Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === 'string') : [],
    // Older reviews: a fixed camera was set for garments only.
    garment: r.garment === true || (r.garment === undefined && r.cameraFixed === true),
    writtenBy: typeof r.writtenBy === 'string' ? r.writtenBy : undefined,
    referenceVideos: Array.isArray(r.referenceVideos)
      ? (r.referenceVideos as Array<Record<string, unknown>>)
        .filter((v) => typeof v?.id === 'string' && typeof v?.name === 'string')
        .map((v) => ({
          id: v.id as string,
          name: v.name as string,
          posterUrl: typeof v.posterUrl === 'string' ? v.posterUrl : null,
          url: typeof v.url === 'string' ? v.url : undefined,
          shots: typeof v.shots === 'number' ? v.shots : undefined,
        }))
      : [],
    outline: readOutline(r.outline),
  };
}

/** One shot of a Seedance prompt, as the approval card shows it. */
export interface PromptShot {
  n: number;
  t: string;
  framing: string;
  action: string;
  camera: string;
  /** The reference images ("(Image k)") it builds on. */
  images: number[];
}

export interface ParsedPrompt {
  /** Who appears, or a short note when nobody does. */
  cast: string | null;
  setting: string | null;
  /** The image the film opens on ("Opening scene: Image 1."). */
  opening: number | null;
  shots: PromptShot[];
  sound: string | null;
  spoken: string | null;
}

/**
 * Reads a Seedance prompt (as compileSeedanceFilm writes it, or as the user edited it) back
 * into cast, setting, shots with their image numbers, sound and the spoken line. Null when it
 * has no "Shot N (…):" lines (a Veo prompt, or one rewritten from scratch).
 */
export function parseVideoPrompt(prompt: string): ParsedPrompt | null {
  const shots: PromptShot[] = [];
  for (const match of prompt.matchAll(/^Shot (\d+) \(([^)]*)\):\s*(.+)$/gm)) {
    const body = match[3].trim();
    const images = [...body.matchAll(/\(Image (\d+)\)/g)].map((image) => Number(image[1]));
    const sentences = body.replace(/\s*\(Image \d+\)/g, '').split(/(?<=\.)\s+/).map((part) => part.replace(/\.$/, '').trim()).filter(Boolean);
    const [framing, ...rest] = sentences;
    const camera = rest.length > 1 ? rest.pop() ?? '' : '';
    shots.push({ n: Number(match[1]), t: match[2].trim(), framing: framing ?? '', action: rest.join('. ') || framing || '', camera, images });
  }
  if (!shots.length) return null;
  const line = (label: string) => prompt.match(new RegExp(`^${label}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? null;
  const castMatch = prompt.match(/Cast:\s*(.+?)\.\s+Faces look/) ?? prompt.match(/One presenter speaks to the camera:\s*(.+?)\.\s+Their face/);
  const cast = castMatch?.[1]?.trim()
    ?? (/display mannequin/i.test(prompt)
      ? 'Nobody: the product on a display mannequin'
      : /no people, no hands|no people, no faces/i.test(prompt)
        ? 'Nobody: a product-only film'
        : /Only an adult's hands appear/i.test(prompt) ? 'Only hands, never a face' : null);
  const sound = line('Sound');
  const spoken = sound?.match(/says(?:, in English)?:\s*[{"“](.+?)[}"”]/)?.[1]?.trim() ?? null;
  const opening = Number(prompt.match(/^Opening scene: Image (\d+)\./m)?.[1]) || null;
  return {
    cast: cast ? cast.charAt(0).toUpperCase() + cast.slice(1) : null,
    setting: line('Setting')?.replace(/\.$/, '') ?? null,
    opening,
    shots,
    // "(music) <sfx> <sfx>. The presenter says…" reads as "music · sfx · sfx".
    sound: sound
      ? sound
        .replace(/\s*The presenter says[\s\S]*$/, '')
        .replace(/original music, not based on any existing song:\s*/gi, '')
        .replace(/\(([^)]*)\)/g, '$1')
        .replace(/\s*<([^>]*)>/g, ' · $1')
        .replace(/^\s*·\s*/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\.$/, '')
      : null,
    spoken,
  };
}

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const trimEnd = (text: string) => text.replace(/[.\s]+$/, '');
const lowerArticle = (text: string) => text.replace(/^(A|An|The)\b/, (word) => word.toLowerCase());

/**
 * The prompt with shot `n` rewritten from its parts, in the format compileSeedanceFilm
 * writes ("Shot 2 (4-8s): Close-up. Action (Image 1). Slow push-in."). `image` null drops
 * the shot's image.
 */
export function setShotInPrompt(prompt: string, n: number, shot: { framing: string; action: string; camera: string; image: number | null }): string {
  // A shot is one line, and its framing and camera move one sentence each, so it reads back the same.
  const oneLine = (text: string) => text.replace(/\s*\n+\s*/g, ' ').trim();
  const framing = oneLine(shot.framing).replace(/\.\s+/g, ', ');
  const action = oneLine(shot.action);
  const camera = oneLine(shot.camera).replace(/\.\s+/g, '; ');
  return prompt.replace(new RegExp(`^Shot ${n} \\(([^)]*)\\):.*$`, 'm'), (_line, t: string) => {
    const parts = [
      framing ? `${upperFirst(trimEnd(framing))}.` : '',
      action ? `${upperFirst(trimEnd(action))}${shot.image ? ` (Image ${shot.image})` : ''}.` : shot.image ? `(Image ${shot.image}).` : '',
      camera ? `${upperFirst(trimEnd(camera))}.` : '',
    ].filter(Boolean);
    return `Shot ${n} (${t}): ${parts.join(' ')}`;
  });
}

/** The prompt with who appears rewritten (the cast or the presenter). */
export function setCastInPrompt(prompt: string, cast: string): string {
  const value = lowerArticle(trimEnd(cast.trim()));
  if (!value) return prompt;
  if (/Cast:\s*.+?\.\s+Faces look/.test(prompt)) return prompt.replace(/Cast:\s*.+?\.(\s+Faces look)/, `Cast: ${value}.$1`);
  return prompt.replace(/(One presenter speaks to the camera:\s*).+?\.(\s+Their face)/, `$1${value}.$2`);
}

/** The prompt with its "Setting:" line rewritten. */
export function setSettingInPrompt(prompt: string, setting: string): string {
  const value = lowerArticle(trimEnd(setting.trim()));
  return value ? prompt.replace(/^Setting:.*$/m, `Setting: ${value}.`) : prompt;
}

/** The prompt with the presenter's spoken line rewritten. */
export function setSpokenInPrompt(prompt: string, line: string): string {
  const value = line.trim().replace(/[{}"“”]/g, '');
  if (!value) return prompt;
  return prompt
    .replace(/(says, in English:\s*)\{[^}]*\}/, `$1{${value}}`)
    .replace(/(The presenter says:\s*)"[^"]*"/, `$1"${value}"`);
}

/** A failure from the video model's music check (the music it made sounded like an existing song). */
export function isMusicFailure(error: string | null | undefined): boolean {
  return Boolean(error && /OutputAudioSensitiveContentDetected|music check/i.test(error));
}

/**
 * The prompt with its music taken out; sound effects and any spoken line stay. Used after the
 * video model's music check stopped a take.
 */
export function withoutMusic(prompt: string): string {
  const note = 'No music at all; only natural ambient sound';
  if (!/^Sound:/m.test(prompt)) return `${prompt.trim()}\n\nSound: ${note}.`;
  return prompt.replace(/^Sound:(.*)$/m, (_line, rest: string) => {
    const sfx = [...rest.matchAll(/<([^>]+)>/g)].map((match) => `<${match[1]}>`).join(' ');
    const effects = rest.match(/effects:\s*([^.;]+)/)?.[1]?.trim();
    const said = rest.match(/(The presenter says[\s\S]*)$/)?.[1]?.trim() ?? (/No voice/i.test(rest) ? 'No voice, no dialogue, no singing.' : '');
    const sounds = sfx || (effects ? `, with ${effects}` : '');
    return `Sound: ${note}${sounds ? ` ${sounds}` : ''}. ${said}`.trim();
  });
}

const SHOT_TIME = /^(Shot \d+ \()(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(s?\):)/gm;
const TIMELINE_TIME = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)s$/;

/** A JSON prompt (Veo's), or null for a text prompt. */
function jsonPrompt(prompt: string): Record<string, unknown> | null {
  if (!prompt.trim().startsWith('{')) return null;
  try {
    const value = JSON.parse(prompt) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** How long the prompt's shots run, in seconds (the end of the last one), or null if it has no timings. */
export function promptSeconds(prompt: string): number | null {
  const json = jsonPrompt(prompt);
  if (json) {
    const format = json.format as Record<string, unknown> | undefined;
    return typeof format?.duration_s === 'number' ? format.duration_s : null;
  }
  const ends = [...prompt.matchAll(SHOT_TIME)].map((match) => Number(match[3]));
  return ends.length ? Math.max(...ends) : null;
}

/**
 * The prompt re-timed to `seconds`: every shot keeps its share of the film ("Shot 2 (2.5-5s)"
 * becomes "(3.8-7.5s)" going from 10 to 15 seconds), the last one ends exactly at `seconds`,
 * and the opening "10-second …" says the new length. Veo's JSON prompts get the same in
 * `format.duration_s` and the timeline.
 */
export function retimePrompt(prompt: string, seconds: number): string {
  const current = promptSeconds(prompt);
  if (!current || current <= 0 || !(seconds > 0) || current === seconds) return prompt;
  const scale = (value: number) => (value >= current ? seconds : Number((value * (seconds / current)).toFixed(1)));
  const json = jsonPrompt(prompt);
  if (json) {
    const format = { ...(json.format as Record<string, unknown>), duration_s: seconds };
    const timeline = Array.isArray(json.timeline)
      ? json.timeline.map((beat) => {
          if (!beat || typeof beat !== 'object') return beat;
          const t = (beat as Record<string, unknown>).t;
          const match = typeof t === 'string' ? t.match(TIMELINE_TIME) : null;
          return match ? { ...beat, t: `${scale(Number(match[1])).toFixed(1)}-${scale(Number(match[2])).toFixed(1)}s` } : beat;
        })
      : json.timeline;
    return JSON.stringify({ ...json, format, ...(timeline !== undefined ? { timeline } : {}) }, null, prompt.includes('\n') ? 2 : undefined);
  }
  return prompt
    .replace(SHOT_TIME, (_line, head: string, start: string, end: string, tail: string) => `${head}${scale(Number(start))}-${scale(Number(end))}${tail}`)
    .replace(/^(\s*)\d+(?:\.\d+)?-second\b/, `$1${seconds}-second`);
}

/**
 * The prompt after reference image `removed` (1-based) is dropped: its mentions go, and
 * later images move up one number, so every "Image k" still points at the right picture.
 */
export function dropImageReference(prompt: string, removed: number): string {
  return prompt
    .replace(/^Opening scene: Image (\d+)\.\n*/m, (line, n) => (Number(n) === removed ? '' : line))
    .replace(/\s*\(Image (\d+)\)/g, (match, n) => (Number(n) === removed ? '' : match))
    .replace(/\bImage (\d+)\b/g, (match, n) => (Number(n) > removed ? `Image ${Number(n) - 1}` : match));
}

/** One render of a video: the first take, or an upgrade made from it. */
export interface VideoTake {
  /** Stable key: the usage row id, or `op:<operation id>` for a take started on this page. */
  key: string;
  operationId: string;
  /** unsaved: finished before videos were kept, so there is no file to show. */
  status: 'rendering' | 'ready' | 'failed' | 'unsaved';
  url: string | null;
  model: string;
  quality: VideoQuality;
  durationSeconds: number;
  aspectRatio: VideoAspect;
  nativeDraft: boolean;
  credits: number;
  error: string | null;
  createdAt: string;
  /** Live, while this page polls it. */
  progress?: number;
  message?: string;
  /** What this take was rendered from, so it can be edited into a new draft. */
  prompt?: string | null;
  frames?: string[];
  /** A new draft made from another take with the user's changes. */
  edited?: boolean;
  /** The take this one was made from (an upgrade or an edited draft). */
  from?: string | null;
}

export interface StudioVideo {
  id: string;
  createdAt: string;
  title: string | null;
  style: string | null;
  poster: string | null;
  /** Set while the video waits for approval. */
  review: VideoReviewState | null;
  cancelled: boolean;
  prompt: string | null;
  /** What "use these settings again" restores. */
  settings: { model: string; quality: VideoQuality; durationSeconds: number; aspectRatio: VideoAspect; style: string };
  /** The first take, then upgrades, oldest first. */
  takes: VideoTake[];
  /** It didn't render (or was cancelled) and its approved plan can come back for approval. */
  retryable?: boolean;
  /** How it was planned: reference images or a first frame, with what each image is. */
  plan?: { mode: VideoReviewState['mode']; frames: VideoReviewState['frames']; garment?: boolean } | null;
}

export type StudioVideoStatus = 'review' | 'rendering' | 'ready' | 'failed' | 'cancelled' | 'unsaved';

export function studioVideoStatus(video: StudioVideo): StudioVideoStatus {
  if (video.review) return 'review';
  if (video.cancelled) return 'cancelled';
  if (video.takes.some((take) => take.status === 'rendering')) return 'rendering';
  if (video.takes.some((take) => take.status === 'ready')) return 'ready';
  if (video.takes[0]?.status === 'unsaved') return 'unsaved';
  return 'failed';
}

/** The take to show first: the newest one with a file, else the newest. */
export function mainTake(video: StudioVideo): VideoTake | null {
  return [...video.takes].reverse().find((take) => take.status === 'ready') ?? video.takes.at(-1) ?? null;
}

export interface VideoHistoryPage {
  videos: StudioVideo[];
  nextBefore: string | null;
}
